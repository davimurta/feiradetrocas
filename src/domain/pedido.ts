import type { PrismaClient, Unidade } from '@prisma/client';
import { DomainError, isDomainError } from '@/lib/errors';

type Db = PrismaClient;

export interface CriarPedidoResult {
  pedidoId: string;
  itemNome: string;
  valor: number;
  compradorNome: string;
  compradorSaldo: number;
  suficiente: boolean;
}

export async function criarPedido(
  db: Db,
  input: { itemId: string; compradorId: string; atendenteId: string; unidade: Unidade },
): Promise<CriarPedidoResult> {
  const item = await db.item.findUnique({
    where: { id: input.itemId },
    select: { id: true, valor: true, nome: true, quantidade: true, unidade: true },
  });
  if (!item || item.unidade !== input.unidade) {
    throw new DomainError('ITEM_INEXISTENTE', 'Item não encontrado nesta unidade.');
  }
  if (item.quantidade < 1) {
    throw new DomainError('ITEM_INDISPONIVEL', 'Item esgotado.');
  }
  const comprador = await db.user.findUnique({
    where: { id: input.compradorId },
    select: { id: true, nome: true, saldo: true },
  });
  if (!comprador) {
    throw new DomainError('CARTEIRA_INEXISTENTE', 'Comprador não encontrado.');
  }

  const pedido = await db.pedido.create({
    data: {
      itemId: item.id,
      compradorId: comprador.id,
      atendenteId: input.atendenteId,
      valor: item.valor,
      quantidade: 1,
      status: 'pendente',
      aprovadoAtendente: true,
      aprovadoComprador: false,
    },
    select: { id: true },
  });

  return {
    pedidoId: pedido.id,
    itemNome: item.nome,
    valor: item.valor,
    compradorNome: comprador.nome,
    compradorSaldo: comprador.saldo,
    suficiente: comprador.saldo >= item.valor,
  };
}

export interface AprovarPedidoResult {
  saldoAtual: number;
  restante: number;
  valor: number;
  itemNome: string;
}

export async function aprovarPedido(
  db: Db,
  input: { pedidoId: string; compradorId: string },
): Promise<AprovarPedidoResult> {
  const pedido = await db.pedido.findUnique({
    where: { id: input.pedidoId },
    select: { id: true, status: true, compradorId: true, itemId: true, valor: true, item: { select: { nome: true } } },
  });
  if (!pedido) throw new DomainError('PEDIDO_INEXISTENTE', 'Pedido não encontrado.');
  if (pedido.compradorId !== input.compradorId) {
    throw new DomainError('NAO_AUTORIZADO', 'Este pedido não é seu.');
  }
  if (pedido.status !== 'pendente') {
    throw new DomainError('PEDIDO_NAO_PENDENTE', 'Este pedido não está mais pendente.');
  }

  try {
    return await db.$transaction(async (tx) => {
      const marca = await tx.pedido.updateMany({
        where: { id: pedido.id, status: 'pendente' },
        data: { aprovadoComprador: true },
      });
      if (marca.count === 0) throw new DomainError('PEDIDO_NAO_PENDENTE', 'Pedido não está mais pendente.');

      const baixa = await tx.item.updateMany({
        where: { id: pedido.itemId, quantidade: { gte: 1 } },
        data: { quantidade: { decrement: 1 } },
      });
      if (baixa.count === 0) throw new DomainError('ITEM_INDISPONIVEL', 'Item esgotado.');

      const deb = await tx.user.updateMany({
        where: { id: input.compradorId, saldo: { gte: pedido.valor } },
        data: { saldo: { decrement: pedido.valor } },
      });
      if (deb.count === 0) throw new DomainError('SALDO_INSUFICIENTE', 'Saldo insuficiente.');

      const trans = await tx.transacao.create({
        data: {
          tipo: 'debito_compra',
          valor: pedido.valor,
          quantidade: 1,
          userId: input.compradorId,
          atendenteId: undefined,
          itemId: pedido.itemId,
        },
        select: { id: true },
      });

      await tx.pedido.update({
        where: { id: pedido.id },
        data: { status: 'aprovado', transacaoId: trans.id },
      });

      const [u, i] = await Promise.all([
        tx.user.findUniqueOrThrow({ where: { id: input.compradorId }, select: { saldo: true } }),
        tx.item.findUniqueOrThrow({ where: { id: pedido.itemId }, select: { quantidade: true } }),
      ]);
      return { saldoAtual: u.saldo, restante: i.quantidade, valor: pedido.valor, itemNome: pedido.item.nome };
    });
  } catch (err) {
    if (isDomainError(err) && (err.code === 'ITEM_INDISPONIVEL' || err.code === 'SALDO_INSUFICIENTE')) {
      await db.pedido
        .updateMany({ where: { id: pedido.id, status: 'pendente' }, data: { status: 'recusado', motivoRecusa: err.code } })
        .catch(() => {});
    }
    throw err;
  }
}

export async function recusarPedido(
  db: Db,
  input: { pedidoId: string; compradorId: string; motivo?: string },
): Promise<void> {
  const p = await db.pedido.findUnique({ where: { id: input.pedidoId }, select: { compradorId: true } });
  if (!p) throw new DomainError('PEDIDO_INEXISTENTE', 'Pedido não encontrado.');
  if (p.compradorId !== input.compradorId) throw new DomainError('NAO_AUTORIZADO', 'Este pedido não é seu.');
  const r = await db.pedido.updateMany({
    where: { id: input.pedidoId, status: 'pendente' },
    data: { status: 'recusado', motivoRecusa: input.motivo ?? 'recusado pelo comprador' },
  });
  if (r.count === 0) throw new DomainError('PEDIDO_NAO_PENDENTE', 'Pedido não está mais pendente.');
}

export async function cancelarPedido(
  db: Db,
  input: { pedidoId: string; atendenteId: string },
): Promise<void> {
  const p = await db.pedido.findUnique({ where: { id: input.pedidoId }, select: { atendenteId: true } });
  if (!p) throw new DomainError('PEDIDO_INEXISTENTE', 'Pedido não encontrado.');
  if (p.atendenteId !== input.atendenteId) throw new DomainError('NAO_AUTORIZADO', 'Este pedido não é seu.');
  const r = await db.pedido.updateMany({
    where: { id: input.pedidoId, status: 'pendente' },
    data: { status: 'cancelado' },
  });
  if (r.count === 0) throw new DomainError('PEDIDO_NAO_PENDENTE', 'Pedido não está mais pendente.');
}
