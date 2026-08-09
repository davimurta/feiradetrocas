import type { PrismaClient, Unidade } from '@prisma/client';
import { Prisma } from '@prisma/client';
import { DomainError } from '@/lib/errors';
import { gerarCodigoEtiqueta } from '@/lib/codigo';

type Db = PrismaClient;

export interface RegistrarEntradaInput {
  alunoId: string;
  atendenteId: string;
  unidade: Unidade;
  nome: string;
  categoria: string;
  valor: number;
  quantidade?: number;
  descricao?: string;
}

export interface PendenteResumo {
  id: string;
  codigo: string;
  nome: string;
  categoria: string;
  valor: number;
  quantidade: number;
  unidade: Unidade;
  descricao: string | null;
}

/**
 * Recebe um item na recepção e o deixa PENDENTE de produção: o aluno ainda NÃO é creditado
 * e o item não entra no catálogo. O crédito e o estoque só acontecem no "push" (colocarEmProducao).
 * Cada recepção gera uma linha própria (sem stacking aqui — o stacking é no push).
 */
export async function registrarEntrada(db: Db, input: RegistrarEntradaInput): Promise<PendenteResumo> {
  const quantidade = input.quantidade ?? 1;
  if (!Number.isInteger(input.valor) || input.valor <= 0) {
    throw new DomainError('VALOR_INVALIDO', 'O valor em fichas deve ser um inteiro positivo.');
  }
  if (!Number.isInteger(quantidade) || quantidade <= 0) {
    throw new DomainError('VALOR_INVALIDO', 'A quantidade deve ser um inteiro positivo.');
  }
  const descricao = input.descricao?.trim() || null;

  for (let tentativa = 1; ; tentativa++) {
    try {
      return await db.itemPendente.create({
        data: {
          codigo: gerarCodigoEtiqueta(),
          nome: input.nome.trim(),
          categoria: input.categoria.trim(),
          valor: input.valor,
          quantidade,
          unidade: input.unidade,
          descricao,
          alunoId: input.alunoId,
          atendenteId: input.atendenteId,
        },
        select: PENDENTE_SELECT,
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError) {
        if (err.code === 'P2003') {
          throw new DomainError('ALUNO_INEXISTENTE', 'Aluno não encontrado para registrar a entrada.');
        }
        if (err.code === 'P2002' && tentativa < MAX_TENTATIVAS) continue; // colisão de código: novo código
      }
      throw err;
    }
  }
}

const PENDENTE_SELECT = {
  id: true,
  codigo: true,
  nome: true,
  categoria: true,
  valor: true,
  quantidade: true,
  unidade: true,
  descricao: true,
} as const;

export interface EditarItemPendenteInput {
  id: string;
  nome: string;
  categoria: string;
  valor: number;
  quantidade: number;
  unidade: Unidade;
  descricao?: string;
}

/** Edita um item ainda PENDENTE (guarda de status: não deixa editar o que já foi para produção). */
export async function editarItemPendente(db: Db, input: EditarItemPendenteInput): Promise<PendenteResumo> {
  if (!Number.isInteger(input.valor) || input.valor <= 0) {
    throw new DomainError('VALOR_INVALIDO', 'O valor em fichas deve ser um inteiro positivo.');
  }
  if (!Number.isInteger(input.quantidade) || input.quantidade <= 0) {
    throw new DomainError('VALOR_INVALIDO', 'A quantidade deve ser um inteiro positivo.');
  }

  const marca = await db.itemPendente.updateMany({
    where: { id: input.id, status: 'pendente' },
    data: {
      nome: input.nome.trim(),
      categoria: input.categoria.trim(),
      valor: input.valor,
      quantidade: input.quantidade,
      unidade: input.unidade,
      descricao: input.descricao?.trim() || null,
    },
  });
  if (marca.count === 0) {
    const existe = await db.itemPendente.findUnique({ where: { id: input.id }, select: { id: true } });
    if (!existe) throw new DomainError('ITEM_INEXISTENTE', 'Item pendente não encontrado.');
    throw new DomainError('ITEM_NAO_PENDENTE', 'Este item já foi colocado em produção.');
  }
  return db.itemPendente.findUniqueOrThrow({ where: { id: input.id }, select: PENDENTE_SELECT });
}

const ITEM_SELECT = {
  id: true,
  codigo: true,
  nome: true,
  categoria: true,
  valor: true,
  quantidade: true,
} as const;

const MAX_TENTATIVAS = 5;

export interface ColocarEmProducaoResult {
  item: {
    id: string;
    codigo: string;
    nome: string;
    categoria: string;
    valor: number;
    quantidade: number;
  };
  creditado: number;
  saldoAtual: number;
  alunoNome: string;
  transacaoId: string;
  novo: boolean;
}

/**
 * "Push" de um item pendente para produção: credita o aluno, soma ao estoque (stacking por
 * nome+valor+unidade) e lança o crédito no extrato — tudo atômico. A guarda de status
 * (compare-and-set) garante que um mesmo pendente não seja produzido/creditado duas vezes.
 */
export async function colocarEmProducao(
  db: Db,
  input: { pendenteId: string },
): Promise<ColocarEmProducaoResult> {
  const pendente = await db.itemPendente.findUnique({
    where: { id: input.pendenteId },
    select: {
      id: true,
      status: true,
      codigo: true,
      nome: true,
      categoria: true,
      valor: true,
      quantidade: true,
      unidade: true,
      descricao: true,
      alunoId: true,
      atendenteId: true,
      aluno: { select: { nome: true } },
    },
  });
  if (!pendente) throw new DomainError('ITEM_INEXISTENTE', 'Item pendente não encontrado.');
  if (pendente.status !== 'pendente') {
    throw new DomainError('ITEM_NAO_PENDENTE', 'Este item já foi colocado em produção.');
  }

  const creditado = pendente.valor * pendente.quantidade;

  for (let tentativa = 1; ; tentativa++) {
    try {
      return await db.$transaction(async (tx) => {
        const marca = await tx.itemPendente.updateMany({
          where: { id: pendente.id, status: 'pendente' },
          data: { status: 'producao' },
        });
        if (marca.count === 0) throw new DomainError('ITEM_NAO_PENDENTE', 'Este item já foi colocado em produção.');

        const existente = await tx.item.findUnique({
          where: { nome_valor_unidade: { nome: pendente.nome, valor: pendente.valor, unidade: pendente.unidade } },
          select: { id: true, descricao: true },
        });

        let item;
        let novo = false;
        if (existente) {
          item = await tx.item.update({
            where: { id: existente.id },
            data: {
              quantidade: { increment: pendente.quantidade },
              ...(existente.descricao ? {} : { descricao: pendente.descricao }),
            },
            select: ITEM_SELECT,
          });
        } else {
          novo = true;
          item = await tx.item.create({
            data: {
              codigo: pendente.codigo,
              nome: pendente.nome,
              categoria: pendente.categoria,
              valor: pendente.valor,
              quantidade: pendente.quantidade,
              unidade: pendente.unidade,
              descricao: pendente.descricao,
            },
            select: ITEM_SELECT,
          });
        }

        const aluno = await tx.user.update({
          where: { id: pendente.alunoId },
          data: { saldo: { increment: creditado } },
          select: { saldo: true },
        });

        const transacao = await tx.transacao.create({
          data: {
            tipo: 'credito_entrada',
            valor: creditado,
            quantidade: pendente.quantidade,
            userId: pendente.alunoId,
            atendenteId: pendente.atendenteId,
            itemId: item.id,
          },
          select: { id: true },
        });

        return {
          item,
          creditado,
          saldoAtual: aluno.saldo,
          alunoNome: pendente.aluno.nome,
          transacaoId: transacao.id,
          novo,
        };
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError) {
        if (err.code === 'P2025') {
          throw new DomainError('ALUNO_INEXISTENTE', 'Aluno não encontrado para creditar as fichas.');
        }
        if (err.code === 'P2002' && tentativa < MAX_TENTATIVAS) continue; // corrida no stack: refaz
      }
      throw err;
    }
  }
}
