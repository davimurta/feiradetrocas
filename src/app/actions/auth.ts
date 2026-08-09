'use server';

import { z } from 'zod';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { rotaInicial } from '@/lib/auth';
import { setSession, clearSession } from '@/lib/session';
import { entrarComSenha, entrarComGoogle } from '@/domain/auth';
import { ok, fail, type ActionResult } from './_result';

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email('Email inválido.').max(160),
  senha: z.string().min(4, 'A senha precisa de ao menos 4 caracteres.').max(128),
});

const googleSchema = z.object({
  email: z.string().trim().toLowerCase().email('Email inválido.').max(160).optional(),
});

export async function loginComSenhaAction(
  input: z.input<typeof loginSchema>,
): Promise<ActionResult<{ rota: string }>> {
  try {
    const dados = loginSchema.parse(input);
    const user = await entrarComSenha(prisma, dados);
    await setSession(user.id);
    return ok({ rota: user.pendente ? '/pendente' : rotaInicial(user.papel) });
  } catch (err) {
    return fail(err);
  }
}

export async function loginComGoogleAction(
  input: z.input<typeof googleSchema>,
): Promise<ActionResult<{ rota: string }>> {
  try {
    const { email } = googleSchema.parse(input);
    const emailFinal = email || 'visitante.google@aluno.cotemig.com.br';
    const user = await entrarComGoogle(prisma, { email: emailFinal });
    await setSession(user.id);
    return ok({ rota: user.pendente ? '/pendente' : rotaInicial(user.papel) });
  } catch (err) {
    return fail(err);
  }
}

export async function logoutAction(): Promise<void> {
  await clearSession();
  redirect('/login');
}
