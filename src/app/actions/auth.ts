'use server';

import { z } from 'zod';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { getCurrentUser, rotaInicial } from '@/lib/auth';
import { setSession, clearSession } from '@/lib/session';
import { entrarComSenha } from '@/domain/auth';
import { invalidarSessoes } from '@/domain/sessao';
import { verificarRate, registrarTentativa } from '@/domain/rateLimit';
import { ipDaRequisicao } from '@/lib/ip';
import { DomainError } from '@/lib/errors';
import { ok, fail, falhaRate, type ActionResult } from './_result';

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email('Email inválido.').max(160),
  senha: z.string().min(4, 'A senha precisa de ao menos 4 caracteres.').max(128),
});

export async function loginComSenhaAction(
  input: z.input<typeof loginSchema>,
): Promise<ActionResult<{ rota: string }>> {
  const ip = await ipDaRequisicao();

  try {
    const dados = loginSchema.parse(input);

    const estado = await verificarRate(prisma, { escopo: 'login', identificador: dados.email, ip });
    if (estado.bloqueado) return falhaRate(estado.segundosRestantes);

    let user;
    try {
      user = await entrarComSenha(prisma, dados);
    } catch (erroLogin) {
      const apos = await registrarTentativa(prisma, {
        escopo: 'login',
        identificador: dados.email,
        ip,
        sucesso: false,
        motivo: erroLogin instanceof DomainError ? erroLogin.code : 'erro',
      });
      if (apos.bloqueado) return falhaRate(apos.segundosRestantes);
      throw erroLogin;
    }

    await registrarTentativa(prisma, {
      escopo: 'login',
      identificador: dados.email,
      ip,
      sucesso: true,
    });

    await setSession(user.id, user.sessionVersion);
    return ok({ rota: user.pendente ? '/pendente' : rotaInicial(user.papel) });
  } catch (err) {
    return fail(err);
  }
}

export async function logoutAction(): Promise<void> {
  const user = await getCurrentUser();
  if (user) await invalidarSessoes(prisma, user.id);
  await clearSession();
  redirect('/login');
}
