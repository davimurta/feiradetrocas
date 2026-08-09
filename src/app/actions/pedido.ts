'use server';

import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth';
import { DomainError } from '@/lib/errors';
import { aprovarPedido, recusarPedido, type AprovarPedidoResult } from '@/domain/pedido';
import { getPedidosPendentesDoComprador, type PedidoPendenteView } from '@/server/queries';
import { ok, fail, type ActionResult } from './_result';

async function exigirLogin() {
  const user = await getCurrentUser();
  if (!user) throw new DomainError('NAO_AUTENTICADO', 'Faça login.');
  if (user.bloqueado) throw new DomainError('CONTA_BLOQUEADA', 'Conta bloqueada.');
  return user;
}

export async function listarPedidosPendentesAction(): Promise<ActionResult<PedidoPendenteView[]>> {
  try {
    const user = await exigirLogin();
    return ok(await getPedidosPendentesDoComprador(user.id));
  } catch (err) {
    return fail(err);
  }
}

const pedidoIdSchema = z.object({ pedidoId: z.string().min(1) });

export async function aprovarPedidoAction(
  input: z.input<typeof pedidoIdSchema>,
): Promise<ActionResult<AprovarPedidoResult>> {
  try {
    const user = await exigirLogin();
    const { pedidoId } = pedidoIdSchema.parse(input);
    return ok(await aprovarPedido(prisma, { pedidoId, compradorId: user.id }));
  } catch (err) {
    return fail(err);
  }
}

export async function recusarPedidoAction(
  input: z.input<typeof pedidoIdSchema>,
): Promise<ActionResult<{ ok: true }>> {
  try {
    const user = await exigirLogin();
    const { pedidoId } = pedidoIdSchema.parse(input);
    await recusarPedido(prisma, { pedidoId, compradorId: user.id });
    return ok({ ok: true });
  } catch (err) {
    return fail(err);
  }
}
