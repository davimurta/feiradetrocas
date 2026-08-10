import type { PrismaClient, Unidade } from '@prisma/client';
import { DomainError } from '@/lib/errors';

type Db = PrismaClient;

export interface PreviaAcoesCriticas {
  participantes: number;
  contasComSaldo: number;
  fichasEmCirculacao: number;
  contasBloqueadas: number;
  pedidosPendentes: number;
  estoquePorUnidade: { unidade: Unidade; produtos: number; pecas: number; pendentes: number }[];
}

export async function getPreviaAcoesCriticas(db: Db): Promise<PreviaAcoesCriticas> {
  const [participantes, comSaldo, soma, bloqueadas, pendentes, porUnidade, pendentesPorUnidade] =
    await Promise.all([
      db.user.count({ where: { papel: 'participante' } }),
      db.user.count({ where: { saldo: { gt: 0 } } }),
      db.user.aggregate({ _sum: { saldo: true } }),
      db.user.count({ where: { bloqueado: true } }),
      db.pedido.count({ where: { status: 'pendente' } }),
      db.item.groupBy({ by: ['unidade'], _count: { _all: true }, _sum: { quantidade: true } }),
      db.itemPendente.groupBy({ by: ['unidade'], _count: { _all: true }, where: { status: 'pendente' } }),
    ]);

  const unidades: Unidade[] = ['barroca', 'floresta'];
  return {
    participantes,
    contasComSaldo: comSaldo,
    fichasEmCirculacao: soma._sum.saldo ?? 0,
    contasBloqueadas: bloqueadas,
    pedidosPendentes: pendentes,
    estoquePorUnidade: unidades.map((u) => ({
      unidade: u,
      produtos: porUnidade.find((p) => p.unidade === u)?._count._all ?? 0,
      pecas: porUnidade.find((p) => p.unidade === u)?._sum.quantidade ?? 0,
      pendentes: pendentesPorUnidade.find((p) => p.unidade === u)?._count._all ?? 0,
    })),
  };
}

export interface ResultadoSaldos {
  contasAfetadas: number;
  fichas: number;
}

export async function zerarTodosOsSaldos(
  db: Db,
  input: { adminId: string; apenasParticipantes: boolean },
): Promise<ResultadoSaldos> {
  const where = {
    saldo: { gt: 0 },
    ...(input.apenasParticipantes ? { papel: 'participante' as const } : {}),
  };

  return db.$transaction(async (tx) => {
    const alvos = await tx.user.findMany({ where, select: { id: true, saldo: true } });
    if (alvos.length === 0) return { contasAfetadas: 0, fichas: 0 };

    await tx.transacao.createMany({
      data: alvos.map((u) => ({
        tipo: 'ajuste_manual' as const,
        valor: -u.saldo,
        quantidade: 0,
        userId: u.id,
        atendenteId: input.adminId,
      })),
    });
    await tx.user.updateMany({
      where: { id: { in: alvos.map((u) => u.id) } },
      data: { saldo: 0 },
    });

    return {
      contasAfetadas: alvos.length,
      fichas: alvos.reduce((s, u) => s + u.saldo, 0),
    };
  });
}

export async function creditarEmLote(
  db: Db,
  input: { adminId: string; valor: number; apenasParticipantes: boolean },
): Promise<ResultadoSaldos> {
  if (!Number.isInteger(input.valor) || input.valor <= 0) {
    throw new DomainError('VALOR_INVALIDO', 'O valor deve ser um inteiro positivo.');
  }

  const where = input.apenasParticipantes ? { papel: 'participante' as const } : {};

  return db.$transaction(async (tx) => {
    const alvos = await tx.user.findMany({ where, select: { id: true } });
    if (alvos.length === 0) return { contasAfetadas: 0, fichas: 0 };

    await tx.transacao.createMany({
      data: alvos.map((u) => ({
        tipo: 'ajuste_manual' as const,
        valor: input.valor,
        quantidade: 0,
        userId: u.id,
        atendenteId: input.adminId,
      })),
    });
    await tx.user.updateMany({
      where: { id: { in: alvos.map((u) => u.id) } },
      data: { saldo: { increment: input.valor } },
    });

    return { contasAfetadas: alvos.length, fichas: alvos.length * input.valor };
  });
}

export interface ResultadoMudancaUnidade {
  movidos: number;
  mesclados: number;
  pecas: number;
  pendentesMovidos: number;
}

export async function moverItensDeUnidade(
  db: Db,
  input: { de: Unidade; para: Unidade },
): Promise<ResultadoMudancaUnidade> {
  if (input.de === input.para) {
    throw new DomainError('VALOR_INVALIDO', 'A unidade de origem e destino são a mesma.');
  }

  return db.$transaction(async (tx) => {
    const origem = await tx.item.findMany({
      where: { unidade: input.de },
      select: { id: true, nome: true, valor: true, quantidade: true },
    });

    let movidos = 0;
    let mesclados = 0;
    let pecas = 0;

    for (const item of origem) {
      const destino = await tx.item.findUnique({
        where: {
          nome_valor_unidade: { nome: item.nome, valor: item.valor, unidade: input.para },
        },
        select: { id: true },
      });

      if (!destino) {
        await tx.item.update({ where: { id: item.id }, data: { unidade: input.para } });
        movidos += 1;
      } else {
        await tx.item.update({
          where: { id: destino.id },
          data: { quantidade: { increment: item.quantidade } },
        });
        await tx.item.update({ where: { id: item.id }, data: { quantidade: 0 } });
        mesclados += 1;
      }
      pecas += item.quantidade;
    }

    const pendentes = await tx.itemPendente.updateMany({
      where: { unidade: input.de, status: 'pendente' },
      data: { unidade: input.para },
    });

    return { movidos, mesclados, pecas, pendentesMovidos: pendentes.count };
  });
}

export async function cancelarPedidosPendentes(
  db: Db,
  input: { motivo: string },
): Promise<{ cancelados: number }> {
  const r = await db.pedido.updateMany({
    where: { status: 'pendente' },
    data: { status: 'cancelado', motivoRecusa: input.motivo },
  });
  return { cancelados: r.count };
}

export async function desbloquearTodasAsContas(db: Db): Promise<{ desbloqueadas: number }> {
  const r = await db.user.updateMany({ where: { bloqueado: true }, data: { bloqueado: false } });
  return { desbloqueadas: r.count };
}
