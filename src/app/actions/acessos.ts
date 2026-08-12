'use server';

import { z } from 'zod';
import { Papel } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { getCurrentUser, assertPapel } from '@/lib/auth';
import { getAcessos, type AcessosView } from '@/server/acessos';
import { desbloquearIdentificador, limparExpirados } from '@/domain/rateLimit';
import { ok, fail, type ActionResult } from './_result';

async function exigirAdmin() {
  const user = await getCurrentUser();
  return assertPapel(user, Papel.admin);
}

const filtroSchema = z.object({
  busca: z.string().trim().max(160).optional(),
  apenasFalhas: z.boolean().optional(),
  horas: z.number().int().min(1).max(720).optional(),
});

export async function listarAcessosAction(
  input: z.input<typeof filtroSchema> = {},
): Promise<ActionResult<AcessosView>> {
  try {
    await exigirAdmin();
    return ok(await getAcessos(filtroSchema.parse(input)));
  } catch (err) {
    return fail(err);
  }
}

const desbloquearSchema = z.object({ identificador: z.string().trim().min(1).max(160) });

export async function desbloquearAcessoAction(
  input: z.input<typeof desbloquearSchema>,
): Promise<ActionResult<{ removidos: number }>> {
  try {
    await exigirAdmin();
    const { identificador } = desbloquearSchema.parse(input);
    return ok(await desbloquearIdentificador(prisma, identificador));
  } catch (err) {
    return fail(err);
  }
}

export async function limparAcessosExpiradosAction(): Promise<
  ActionResult<{ baldes: number; tentativas: number }>
> {
  try {
    await exigirAdmin();
    return ok(await limparExpirados(prisma));
  } catch (err) {
    return fail(err);
  }
}
