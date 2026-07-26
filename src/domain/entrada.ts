import type { PrismaClient, Unidade } from '@prisma/client';
import { Prisma } from '@prisma/client';
import { DomainError } from '@/lib/errors';
import { gerarCodigoEtiqueta } from '@/lib/codigo';

type Db = PrismaClient;

export interface ReceberItemInput {
  alunoId: string;
  atendenteId: string;
  unidade: Unidade;
  nome: string;
  categoria: string;
  valor: number;
  quantidade?: number;
}

export interface ReceberItemResult {
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
  transacaoId: string;
  novo: boolean;
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

export async function receberItem(db: Db, input: ReceberItemInput): Promise<ReceberItemResult> {
  const quantidade = input.quantidade ?? 1;
  if (!Number.isInteger(input.valor) || input.valor <= 0) {
    throw new DomainError('VALOR_INVALIDO', 'O valor em fichas deve ser um inteiro positivo.');
  }
  if (!Number.isInteger(quantidade) || quantidade <= 0) {
    throw new DomainError('VALOR_INVALIDO', 'A quantidade deve ser um inteiro positivo.');
  }
  const nome = input.nome.trim();
  const categoria = input.categoria.trim();
  const creditoTotal = input.valor * quantidade;

  for (let tentativa = 1; ; tentativa++) {
    try {
      return await db.$transaction(async (tx) => {
        const existente = await tx.item.findUnique({
          where: { nome_valor_unidade: { nome, valor: input.valor, unidade: input.unidade } },
          select: { id: true },
        });

        let item;
        let novo = false;
        if (existente) {
          item = await tx.item.update({
            where: { id: existente.id },
            data: { quantidade: { increment: quantidade } },
            select: ITEM_SELECT,
          });
        } else {
          novo = true;
          item = await tx.item.create({
            data: {
              codigo: gerarCodigoEtiqueta(),
              nome,
              categoria,
              valor: input.valor,
              quantidade,
              unidade: input.unidade,
            },
            select: ITEM_SELECT,
          });
        }

        const aluno = await tx.user.update({
          where: { id: input.alunoId },
          data: { saldo: { increment: creditoTotal } },
          select: { saldo: true },
        });

        const transacao = await tx.transacao.create({
          data: {
            tipo: 'credito_entrada',
            valor: creditoTotal,
            quantidade,
            userId: input.alunoId,
            atendenteId: input.atendenteId,
            itemId: item.id,
          },
          select: { id: true },
        });

        return { item, creditado: creditoTotal, saldoAtual: aluno.saldo, transacaoId: transacao.id, novo };
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError) {
        if (err.code === 'P2025') {
          throw new DomainError('ALUNO_INEXISTENTE', 'Aluno não encontrado para creditar as fichas.');
        }
        if (err.code === 'P2002' && tentativa < MAX_TENTATIVAS) continue;
      }
      throw err;
    }
  }
}
