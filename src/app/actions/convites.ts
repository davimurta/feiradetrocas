'use server';

import { z } from 'zod';
import { Papel, Unidade } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { getCurrentUser, assertPapel } from '@/lib/auth';
import {
  criarConvite,
  listarConvites,
  definirConviteAtivo,
  estenderConvite,
  type ConviteView,
} from '@/domain/convite';
import { ok, fail, type ActionResult } from './_result';

async function exigirAdmin() {
  const user = await getCurrentUser();
  return assertPapel(user, Papel.admin);
}

const criarSchema = z.object({
  unidade: z.nativeEnum(Unidade),
  descricao: z.string().trim().max(120).optional(),
  validadeHoras: z.number().int().min(1).max(24 * 30),
  maxUsos: z.number().int().min(1).max(10000).nullable().optional(),
});

export async function criarConviteAction(
  input: z.input<typeof criarSchema>,
): Promise<ActionResult<ConviteView>> {
  try {
    const admin = await exigirAdmin();
    const dados = criarSchema.parse(input);
    return ok(await criarConvite(prisma, { ...dados, criadoPorId: admin.id }));
  } catch (err) {
    return fail(err);
  }
}

export async function listarConvitesAction(): Promise<ActionResult<ConviteView[]>> {
  try {
    await exigirAdmin();
    return ok(await listarConvites(prisma));
  } catch (err) {
    return fail(err);
  }
}

const ativoSchema = z.object({ id: z.string().min(1), ativo: z.boolean() });

export async function definirConviteAtivoAction(
  input: z.input<typeof ativoSchema>,
): Promise<ActionResult<ConviteView>> {
  try {
    await exigirAdmin();
    return ok(await definirConviteAtivo(prisma, ativoSchema.parse(input)));
  } catch (err) {
    return fail(err);
  }
}

const estenderSchema = z.object({ id: z.string().min(1), horas: z.number().int().min(1).max(24 * 30) });

export async function estenderConviteAction(
  input: z.input<typeof estenderSchema>,
): Promise<ActionResult<ConviteView>> {
  try {
    await exigirAdmin();
    return ok(await estenderConvite(prisma, estenderSchema.parse(input)));
  } catch (err) {
    return fail(err);
  }
}
