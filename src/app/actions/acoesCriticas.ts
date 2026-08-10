'use server';

import { z } from 'zod';
import { Papel, Unidade } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { getCurrentUser, assertPapel } from '@/lib/auth';
import { DomainError } from '@/lib/errors';
import {
  getPreviaAcoesCriticas,
  zerarTodosOsSaldos,
  creditarEmLote,
  moverItensDeUnidade,
  cancelarPedidosPendentes,
  desbloquearTodasAsContas,
  type PreviaAcoesCriticas,
  type ResultadoSaldos,
  type ResultadoMudancaUnidade,
} from '@/domain/acoesCriticas';
import { FRASE_CONFIRMACAO, confirmacaoValida } from '@/lib/acoesCriticas';
import { ok, fail, type ActionResult } from './_result';

async function exigirAdmin() {
  const user = await getCurrentUser();
  return assertPapel(user, Papel.admin);
}

function conferirConfirmacao(texto: string) {
  if (!confirmacaoValida(texto)) {
    throw new DomainError(
      'CONFIRMACAO_INVALIDA',
      `Digite ${FRASE_CONFIRMACAO} para executar esta ação.`,
    );
  }
}

const confirmacaoSchema = z.object({ confirmacao: z.string().min(1).max(40) });

export async function previaAcoesCriticasAction(): Promise<ActionResult<PreviaAcoesCriticas>> {
  try {
    await exigirAdmin();
    return ok(await getPreviaAcoesCriticas(prisma));
  } catch (err) {
    return fail(err);
  }
}

const saldosSchema = confirmacaoSchema.extend({
  apenasParticipantes: z.boolean().default(true),
});

export async function zerarSaldosAction(
  input: z.input<typeof saldosSchema>,
): Promise<ActionResult<ResultadoSaldos>> {
  try {
    const admin = await exigirAdmin();
    const { confirmacao, apenasParticipantes } = saldosSchema.parse(input);
    conferirConfirmacao(confirmacao);
    return ok(await zerarTodosOsSaldos(prisma, { adminId: admin.id, apenasParticipantes }));
  } catch (err) {
    return fail(err);
  }
}

const creditarSchema = saldosSchema.extend({
  valor: z.number().int().positive().max(100_000),
});

export async function creditarEmLoteAction(
  input: z.input<typeof creditarSchema>,
): Promise<ActionResult<ResultadoSaldos>> {
  try {
    const admin = await exigirAdmin();
    const { confirmacao, apenasParticipantes, valor } = creditarSchema.parse(input);
    conferirConfirmacao(confirmacao);
    return ok(await creditarEmLote(prisma, { adminId: admin.id, valor, apenasParticipantes }));
  } catch (err) {
    return fail(err);
  }
}

const moverSchema = confirmacaoSchema.extend({
  de: z.nativeEnum(Unidade),
  para: z.nativeEnum(Unidade),
});

export async function moverItensDeUnidadeAction(
  input: z.input<typeof moverSchema>,
): Promise<ActionResult<ResultadoMudancaUnidade>> {
  try {
    await exigirAdmin();
    const { confirmacao, de, para } = moverSchema.parse(input);
    conferirConfirmacao(confirmacao);
    return ok(await moverItensDeUnidade(prisma, { de, para }));
  } catch (err) {
    return fail(err);
  }
}

const cancelarSchema = confirmacaoSchema.extend({
  motivo: z.string().trim().min(1).max(200).default('Cancelado pelo admin'),
});

export async function cancelarPedidosPendentesAction(
  input: z.input<typeof cancelarSchema>,
): Promise<ActionResult<{ cancelados: number }>> {
  try {
    await exigirAdmin();
    const { confirmacao, motivo } = cancelarSchema.parse(input);
    conferirConfirmacao(confirmacao);
    return ok(await cancelarPedidosPendentes(prisma, { motivo }));
  } catch (err) {
    return fail(err);
  }
}

export async function desbloquearContasAction(
  input: z.input<typeof confirmacaoSchema>,
): Promise<ActionResult<{ desbloqueadas: number }>> {
  try {
    await exigirAdmin();
    const { confirmacao } = confirmacaoSchema.parse(input);
    conferirConfirmacao(confirmacao);
    return ok(await desbloquearTodasAsContas(prisma));
  } catch (err) {
    return fail(err);
  }
}
