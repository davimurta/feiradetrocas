import type { PrismaClient } from '@prisma/client';
import { DomainError } from '@/lib/errors';

type Db = PrismaClient;

export interface AjustarSaldoResult {
  saldoAtual: number;
  delta: number;
}

export async function ajustarSaldo(
  db: Db,
  input: { userId: string; novoSaldo: number; atendenteId?: string },
): Promise<AjustarSaldoResult> {
  if (!Number.isInteger(input.novoSaldo) || input.novoSaldo < 0) {
    throw new DomainError('VALOR_INVALIDO', 'O saldo deve ser um inteiro >= 0.');
  }
  return db.$transaction(async (tx) => {
    const u = await tx.user.findUnique({ where: { id: input.userId }, select: { saldo: true } });
    if (!u) throw new DomainError('ALUNO_INEXISTENTE', 'Usuário não encontrado.');

    const delta = input.novoSaldo - u.saldo;
    if (delta !== 0) {
      await tx.user.update({ where: { id: input.userId }, data: { saldo: input.novoSaldo } });
      await tx.transacao.create({
        data: {
          tipo: 'ajuste_manual',
          valor: delta, // com sinal
          quantidade: 0,
          userId: input.userId,
          atendenteId: input.atendenteId,
        },
      });
    }
    return { saldoAtual: input.novoSaldo, delta };
  });
}
