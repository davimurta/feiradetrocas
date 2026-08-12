'use server';

import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { rotaInicial } from '@/lib/auth';
import { setSession } from '@/lib/session';
import { ipDaRequisicao } from '@/lib/ip';
import { DomainError } from '@/lib/errors';
import { buscarPerfilCotemig } from '@/lib/cotemig-api';
import { cadastrarComVinculo, cadastrarComConvite, identificadorCotemig } from '@/domain/cadastro';
import { verificarRate, registrarTentativa } from '@/domain/rateLimit';
import { normalizarCodigo, codigoPlausivel } from '@/lib/convite';
import { ok, fail, falhaRate, type ActionResult } from './_result';

const cadastroSchema = z.object({
  usuario: z.string().trim().min(3, 'Informe seu usuário do portal.').max(64),
  senhaCotemig: z.string().min(1, 'Informe a senha do portal.').max(128),
  senhaApp: z.string().min(4, 'A senha precisa de ao menos 4 caracteres.').max(128),
});

export async function cadastrarAction(
  input: z.input<typeof cadastroSchema>,
): Promise<ActionResult<{ rota: string }>> {
  const ip = await ipDaRequisicao();

  try {
    const dados = cadastroSchema.parse(input);
    const identificador = identificadorCotemig(dados.usuario);

    const estado = await verificarRate(prisma, { escopo: 'cadastro', identificador, ip });
    if (estado.bloqueado) return falhaRate(estado.segundosRestantes);

    const resposta = await buscarPerfilCotemig(dados.usuario, dados.senhaCotemig);

    if (!resposta.ok) {
      if (resposta.motivo === 'credencial') {
        const apos = await registrarTentativa(prisma, {
          escopo: 'cadastro',
          identificador,
          ip,
          sucesso: false,
          motivo: 'credencial',
        });
        if (apos.bloqueado) return falhaRate(apos.segundosRestantes);
        throw new DomainError('CREDENCIAL_INVALIDA', 'Usuário ou senha do portal incorretos.');
      }

      await registrarTentativa(prisma, {
        escopo: 'cadastro',
        identificador,
        ip,
        sucesso: true,
        motivo: resposta.motivo,
      });
      throw new DomainError(
        'CADASTRO_INDISPONIVEL',
        'Não foi possível confirmar seu vínculo com o Cotemig agora. Tente novamente em alguns minutos.',
      );
    }

    const user = await cadastrarComVinculo(prisma, {
      perfil: resposta.perfil,
      senhaApp: dados.senhaApp,
    });

    await registrarTentativa(prisma, {
      escopo: 'cadastro',
      identificador,
      ip,
      sucesso: true,
      motivo: 'vinculado',
    });

    await setSession(user.id, user.sessionVersion);
    return ok({ rota: user.pendente ? '/pendente' : rotaInicial(user.papel) });
  } catch (err) {
    return fail(err);
  }
}

const conviteSchema = z.object({
  codigo: z.string().trim().min(1, 'Informe o código de convite.').max(32),
  nome: z.string().trim().min(2, 'Informe seu nome.').max(120),
  email: z.string().trim().toLowerCase().email('Email inválido.').max(160),
  senhaApp: z.string().min(4, 'A senha precisa de ao menos 4 caracteres.').max(128),
});

const CHAVE_CONVITE = 'global';

export async function cadastrarComConviteAction(
  input: z.input<typeof conviteSchema>,
): Promise<ActionResult<{ rota: string }>> {
  const ip = await ipDaRequisicao();

  try {
    const dados = conviteSchema.parse(input);

    const estado = await verificarRate(prisma, {
      escopo: 'convite',
      identificador: CHAVE_CONVITE,
      ip,
    });
    if (estado.bloqueado) return falhaRate(estado.segundosRestantes);

    if (!codigoPlausivel(dados.codigo)) {
      const apos = await registrarTentativa(prisma, {
        escopo: 'convite',
        identificador: CHAVE_CONVITE,
        ip,
        sucesso: false,
        motivo: `formato:${normalizarCodigo(dados.codigo).slice(0, 12)}`,
      });
      if (apos.bloqueado) return falhaRate(apos.segundosRestantes);
      throw new DomainError('CONVITE_INVALIDO', 'Código de convite inválido ou expirado.');
    }

    let user;
    try {
      user = await cadastrarComConvite(prisma, dados);
    } catch (erroCadastro) {
      const codigo = erroCadastro instanceof DomainError ? erroCadastro.code : 'erro';

      if (codigo === 'EMAIL_EM_USO') throw erroCadastro;

      const apos = await registrarTentativa(prisma, {
        escopo: 'convite',
        identificador: CHAVE_CONVITE,
        ip,
        sucesso: false,
        motivo: codigo,
      });
      if (apos.bloqueado) return falhaRate(apos.segundosRestantes);
      throw erroCadastro;
    }

    await registrarTentativa(prisma, {
      escopo: 'convite',
      identificador: CHAVE_CONVITE,
      ip,
      sucesso: true,
      motivo: 'convite_usado',
    });

    await setSession(user.id, user.sessionVersion);
    return ok({ rota: '/carteira' });
  } catch (err) {
    return fail(err);
  }
}
