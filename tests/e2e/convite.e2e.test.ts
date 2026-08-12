import { it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('next/headers', () => ({
  cookies: async () => ({ set: () => {}, get: () => undefined, delete: () => {} }),
  headers: async () => new Map(),
}));

import { Papel } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { __setMockUserId } from '@/lib/auth';
import { cadastrarComConviteAction } from '@/app/actions/cadastro';
import { loginComSenhaAction } from '@/app/actions/auth';
import {
  criarConviteAction,
  listarConvitesAction,
  definirConviteAtivoAction,
  estenderConviteAction,
} from '@/app/actions/convites';
import { formatarCodigo } from '@/lib/convite';
import { describeDb } from '../helpers/db';
import { criarUsuario } from '../helpers/factories';

const ENV_ORIGINAL = { ...process.env };

beforeEach(() => {
  __setMockUserId(null);
  process.env.SCRYPT_N = '16384';
  process.env.RATE_LIMIT_ATIVO = 'true';
  process.env.RATE_LIMIT_IP_ATIVO = 'false';
});

afterEach(() => {
  process.env = { ...ENV_ORIGINAL };
});

async function convite(over: { unidade?: 'barroca' | 'floresta'; maxUsos?: number | null; validadeHoras?: number } = {}) {
  const admin = await criarUsuario({ papel: Papel.admin });
  __setMockUserId(admin.id);
  const r = await criarConviteAction({
    unidade: over.unidade ?? 'barroca',
    validadeHoras: over.validadeHoras ?? 24,
    maxUsos: over.maxUsos ?? null,
    descricao: 'professores',
  });
  __setMockUserId(null);
  if (!r.ok) throw new Error('falhou ao criar convite');
  return { admin, convite: r.data };
}

describeDb('Cadastro por convite', () => {
  it('quem tem o código cria conta ativa, sem passar por aprovação', async () => {
    const { convite: c } = await convite();

    const r = await cadastrarComConviteAction({
      codigo: formatarCodigo(c.codigo),
      nome: 'Professor Silva',
      email: 'silva@exemplo.com',
      senhaApp: 'minhasenha',
    });

    expect(r).toMatchObject({ ok: true, data: { rota: '/carteira' } });

    const user = await prisma.user.findUniqueOrThrow({ where: { email: 'silva@exemplo.com' } });
    expect(user.papel).toBe('participante');
    expect(user.pendente).toBe(false);
    expect(user.bloqueado).toBe(false);
    expect(user.provider).toBe('convite');
    expect(user.conviteId).toBe(c.id);
    expect(user.cotemigId).toBeNull();
    expect(user.codigoCarteira).toMatch(/^v\d{6}$/);
  });

  it('a unidade vem do convite, não da pessoa', async () => {
    const { convite: c } = await convite({ unidade: 'floresta' });

    await cadastrarComConviteAction({
      codigo: c.codigo,
      nome: 'Visitante',
      email: 'visita@exemplo.com',
      senhaApp: 'minhasenha',
    });

    const user = await prisma.user.findUniqueOrThrow({ where: { email: 'visita@exemplo.com' } });
    expect(user.unidade).toBe('floresta');
  });

  it('o mesmo código serve para várias pessoas', async () => {
    const { convite: c } = await convite();

    for (const nome of ['Ana', 'Bia', 'Caio']) {
      const r = await cadastrarComConviteAction({
        codigo: c.codigo,
        nome,
        email: `${nome.toLowerCase()}@exemplo.com`,
        senhaApp: 'minhasenha',
      });
      expect(r.ok).toBe(true);
    }

    expect(await prisma.user.count({ where: { conviteId: c.id } })).toBe(3);
    const depois = await prisma.convite.findUniqueOrThrow({ where: { id: c.id } });
    expect(depois.usos).toBe(3);
  });

  it('aceita o código digitado de qualquer jeito: minúscula, com ou sem hífen', async () => {
    const { convite: c } = await convite();

    expect(
      (await cadastrarComConviteAction({
        codigo: formatarCodigo(c.codigo).toLowerCase(),
        nome: 'Ana',
        email: 'ana@exemplo.com',
        senhaApp: 'minhasenha',
      })).ok,
    ).toBe(true);

    expect(
      (await cadastrarComConviteAction({
        codigo: ` ${c.codigo} `,
        nome: 'Bia',
        email: 'bia@exemplo.com',
        senhaApp: 'minhasenha',
      })).ok,
    ).toBe(true);
  });

  it('código inexistente não cria conta', async () => {
    const r = await cadastrarComConviteAction({
      codigo: 'ABCD-EFGH',
      nome: 'Intruso',
      email: 'intruso@exemplo.com',
      senhaApp: 'minhasenha',
    });

    expect(r).toMatchObject({ ok: false, error: { code: 'CONVITE_INVALIDO' } });
    expect(await prisma.user.count({ where: { email: 'intruso@exemplo.com' } })).toBe(0);
  });

  it('convite expirado não vale', async () => {
    const { convite: c } = await convite();
    await prisma.convite.update({
      where: { id: c.id },
      data: { expiraEm: new Date(Date.now() - 1000) },
    });

    const r = await cadastrarComConviteAction({
      codigo: c.codigo,
      nome: 'Atrasado',
      email: 'atrasado@exemplo.com',
      senhaApp: 'minhasenha',
    });
    expect(r).toMatchObject({ ok: false, error: { code: 'CONVITE_INVALIDO' } });
  });

  it('convite revogado para de funcionar na hora', async () => {
    const { admin, convite: c } = await convite();

    __setMockUserId(admin.id);
    expect((await definirConviteAtivoAction({ id: c.id, ativo: false })).ok).toBe(true);
    __setMockUserId(null);

    const r = await cadastrarComConviteAction({
      codigo: c.codigo,
      nome: 'Depois',
      email: 'depois@exemplo.com',
      senhaApp: 'minhasenha',
    });
    expect(r).toMatchObject({ ok: false, error: { code: 'CONVITE_INVALIDO' } });
  });

  it('o teto de usos é respeitado', async () => {
    const { convite: c } = await convite({ maxUsos: 2 });

    expect((await cadastrarComConviteAction({ codigo: c.codigo, nome: 'Ana', email: 'ana@x.com', senhaApp: 'minhasenha' })).ok).toBe(true);
    expect((await cadastrarComConviteAction({ codigo: c.codigo, nome: 'Bia', email: 'bia@x.com', senhaApp: 'minhasenha' })).ok).toBe(true);

    const terceira = await cadastrarComConviteAction({ codigo: c.codigo, nome: 'Caio', email: 'caio@x.com', senhaApp: 'minhasenha' });
    expect(terceira).toMatchObject({ ok: false, error: { code: 'CONVITE_INVALIDO' } });
  });

  it('o teto aguenta corrida: cinco pessoas disputando as duas últimas vagas', async () => {
    const { convite: c } = await convite({ maxUsos: 2 });

    const resultados = await Promise.all(
      Array.from({ length: 5 }, (_, i) =>
        cadastrarComConviteAction({
          codigo: c.codigo,
          nome: `Pessoa ${i}`,
          email: `p${i}@exemplo.com`,
          senhaApp: 'minhasenha',
        }),
      ),
    );

    expect(resultados.filter((r) => r.ok)).toHaveLength(2);
    expect(await prisma.user.count({ where: { conviteId: c.id } })).toBe(2);
  });

  it('email já usado não consome o convite', async () => {
    const { convite: c } = await convite();
    await cadastrarComConviteAction({ codigo: c.codigo, nome: 'Ana', email: 'ana@x.com', senhaApp: 'minhasenha' });

    const r = await cadastrarComConviteAction({ codigo: c.codigo, nome: 'Outro', email: 'ana@x.com', senhaApp: 'outrasenha' });
    expect(r).toMatchObject({ ok: false, error: { code: 'EMAIL_EM_USO' } });

    const depois = await prisma.convite.findUniqueOrThrow({ where: { id: c.id } });
    expect(depois.usos).toBe(1);
  });

  it('depois de cadastrada, a pessoa entra pelo login normal', async () => {
    const { convite: c } = await convite();
    await cadastrarComConviteAction({ codigo: c.codigo, nome: 'Ana', email: 'ana@exemplo.com', senhaApp: 'minhasenha' });

    const login = await loginComSenhaAction({ email: 'ana@exemplo.com', senha: 'minhasenha' });
    expect(login).toMatchObject({ ok: true, data: { rota: '/carteira' } });
  });

  it('varrer códigos ao acaso é cortado pelo rate limit', async () => {
    process.env.RATE_LIMIT_CONVITE_FALHAS = '5';

    const tentativas = [];
    for (let i = 0; i < 7; i++) {
      tentativas.push(
        await cadastrarComConviteAction({
          codigo: `ZZZZ-ZZZ${i}`,
          nome: 'bot',
          email: `bot${i}@exemplo.com`,
          senhaApp: 'minhasenha',
        }),
      );
    }

    const bloqueadas = tentativas.filter(
      (r) => !r.ok && r.error.code === 'MUITAS_TENTATIVAS',
    );
    expect(bloqueadas.length).toBeGreaterThan(0);
    expect(await prisma.user.count()).toBe(0);
  });

  it('só admin gera, lista, revoga e estende convite', async () => {
    const aluno = await criarUsuario({ papel: Papel.participante });
    const { convite: c } = await convite();
    __setMockUserId(aluno.id);

    expect(await criarConviteAction({ unidade: 'barroca', validadeHoras: 24 })).toMatchObject({
      ok: false,
      error: { code: 'NAO_AUTORIZADO' },
    });
    expect(await listarConvitesAction()).toMatchObject({ ok: false, error: { code: 'NAO_AUTORIZADO' } });
    expect(await definirConviteAtivoAction({ id: c.id, ativo: false })).toMatchObject({
      ok: false,
      error: { code: 'NAO_AUTORIZADO' },
    });
    expect(await estenderConviteAction({ id: c.id, horas: 24 })).toMatchObject({
      ok: false,
      error: { code: 'NAO_AUTORIZADO' },
    });
  });

  it('estender empurra a expiração de um convite já vencido a partir de agora', async () => {
    const { admin, convite: c } = await convite();
    await prisma.convite.update({
      where: { id: c.id },
      data: { expiraEm: new Date(Date.now() - 3600 * 1000) },
    });

    __setMockUserId(admin.id);
    const r = await estenderConviteAction({ id: c.id, horas: 24 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(new Date(r.data.expiraEm).getTime()).toBeGreaterThan(Date.now());
    expect(r.data.valido).toBe(true);
  });

  it('a listagem do admin mostra a situação de cada convite', async () => {
    const { admin, convite: c } = await convite({ maxUsos: 1 });
    await cadastrarComConviteAction({ codigo: c.codigo, nome: 'Ana', email: 'ana@x.com', senhaApp: 'minhasenha' });

    __setMockUserId(admin.id);
    const r = await listarConvitesAction();
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    expect(r.data[0]).toMatchObject({ usos: 1, maxUsos: 1, valido: false, descricao: 'professores' });
  });
});
