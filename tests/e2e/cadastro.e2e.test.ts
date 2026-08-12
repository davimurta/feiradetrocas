import { it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/lib/cotemig-api', () => ({
  buscarPerfilCotemig: vi.fn(),
}));

vi.mock('next/headers', () => ({
  cookies: async () => ({ set: () => {}, get: () => undefined, delete: () => {} }),
  headers: async () => new Map(),
}));

import { prisma } from '@/lib/prisma';
import { buscarPerfilCotemig } from '@/lib/cotemig-api';
import { cadastrarAction } from '@/app/actions/cadastro';
import { loginComSenhaAction } from '@/app/actions/auth';
import { garantirAluno } from '@/domain/auth';
import { describeDb } from '../helpers/db';

const ENV_ORIGINAL = { ...process.env };

const PERFIL = {
  usuario: '10240099',
  nome: 'Ana Aluna',
  emailInstitucional: '10240099@aluno.cotemig.com.br',
  email: 'ana@gmail.com',
};

function perfilOk(over: Partial<typeof PERFIL> = {}) {
  vi.mocked(buscarPerfilCotemig).mockResolvedValue({ ok: true, perfil: { ...PERFIL, ...over } });
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.SCRYPT_N = '16384';
  process.env.RATE_LIMIT_ATIVO = 'true';
  process.env.RATE_LIMIT_IP_ATIVO = 'false';
  process.env.RATE_LIMIT_CADASTRO_FALHAS = '3';
  process.env.RATE_LIMIT_CADASTRO_BLOQUEIO_SEG = '60';
});

afterEach(() => {
  process.env = { ...ENV_ORIGINAL };
});

describeDb('Cadastro com vínculo Cotemig (Server Action)', () => {
  it('vínculo confirmado cria a conta como participante', async () => {
    perfilOk();

    const r = await cadastrarAction({
      usuario: '10240099',
      senhaCotemig: 'senha-do-portal',
      senhaApp: 'minhasenha',
    });

    expect(r).toMatchObject({ ok: true, data: { rota: '/carteira' } });

    const user = await prisma.user.findUniqueOrThrow({ where: { cotemigId: '10240099' } });
    expect(user.papel).toBe('participante');
    expect(user.codigoCarteira).toBe('10240099');
    expect(user.email).toBe('10240099@aluno.cotemig.com.br');
    expect(user.unidade).toBe('barroca');
    expect(user.pendente).toBe(false);
    expect(user.vinculadoEm).toBeInstanceOf(Date);
    expect(user.provider).toBe('cotemig');
  });

  it('a senha do portal não é gravada em campo nenhum', async () => {
    perfilOk();
    await cadastrarAction({
      usuario: '10240099',
      senhaCotemig: 'senha-do-portal',
      senhaApp: 'minhasenha',
    });

    const user = await prisma.user.findUniqueOrThrow({ where: { cotemigId: '10240099' } });
    expect(JSON.stringify(user)).not.toContain('senha-do-portal');
    expect(user.senhaHash).not.toContain('senha-do-portal');

    const tentativas = await prisma.tentativaAuth.findMany();
    expect(JSON.stringify(tentativas)).not.toContain('senha-do-portal');
  });

  it('reivindica a conta pré-provisionada pela recepção em vez de duplicar', async () => {
    const { user: preProvisionada } = await garantirAluno(prisma, { identificador: '10240099' });
    expect(preProvisionada.senhaHash).toBeNull();

    perfilOk();
    const r = await cadastrarAction({
      usuario: '10240099',
      senhaCotemig: 'senha-do-portal',
      senhaApp: 'minhasenha',
    });
    expect(r.ok).toBe(true);

    expect(await prisma.user.count({ where: { codigoCarteira: '10240099' } })).toBe(1);
    const depois = await prisma.user.findUniqueOrThrow({ where: { id: preProvisionada.id } });
    expect(depois.cotemigId).toBe('10240099');
    expect(depois.senhaHash).toBeTruthy();
  });

  it('a unidade continua saindo da regra da matrícula', async () => {
    perfilOk({ usuario: '20240300', emailInstitucional: '20240300@aluno.cotemig.com.br' });
    await cadastrarAction({ usuario: '20240300', senhaCotemig: 'x', senhaApp: 'minhasenha' });

    const user = await prisma.user.findUniqueOrThrow({ where: { cotemigId: '20240300' } });
    expect(user.unidade).toBe('floresta');
  });

  it('aluno de faculdade não é bloqueado', async () => {
    perfilOk({ usuario: '72600225', emailInstitucional: '72600225@aluno.faculdadecotemig.br' });
    const r = await cadastrarAction({ usuario: '72600225', senhaCotemig: 'x', senhaApp: 'minhasenha' });

    expect(r.ok).toBe(true);
    const user = await prisma.user.findUniqueOrThrow({ where: { cotemigId: '72600225' } });
    expect(user.pendente).toBe(false);
    expect(user.email).toBe('72600225@aluno.faculdadecotemig.br');
  });

  it('credencial recusada pela API não cria conta', async () => {
    vi.mocked(buscarPerfilCotemig).mockResolvedValue({ ok: false, motivo: 'credencial' });

    const r = await cadastrarAction({ usuario: '10240099', senhaCotemig: 'errada', senhaApp: 'minhasenha' });

    expect(r).toMatchObject({ ok: false, error: { code: 'CREDENCIAL_INVALIDA' } });
    expect(await prisma.user.count()).toBe(0);
  });

  it('API fora do ar é fail-closed: não cria conta e avisa indisponibilidade', async () => {
    vi.mocked(buscarPerfilCotemig).mockResolvedValue({ ok: false, motivo: 'indisponivel' });

    const r = await cadastrarAction({ usuario: '10240099', senhaCotemig: 'x', senhaApp: 'minhasenha' });

    expect(r).toMatchObject({ ok: false, error: { code: 'CADASTRO_INDISPONIVEL' } });
    expect(await prisma.user.count()).toBe(0);
  });

  it('indisponibilidade da API não consome tentativa do rate limit', async () => {
    vi.mocked(buscarPerfilCotemig).mockResolvedValue({ ok: false, motivo: 'indisponivel' });

    for (let i = 0; i < 5; i++) {
      await cadastrarAction({ usuario: '10240099', senhaCotemig: 'x', senhaApp: 'minhasenha' });
    }

    perfilOk();
    const r = await cadastrarAction({ usuario: '10240099', senhaCotemig: 'x', senhaApp: 'minhasenha' });
    expect(r.ok).toBe(true);
  });

  it('brute force contra a API do colégio é cortado e devolve o tempo de espera', async () => {
    vi.mocked(buscarPerfilCotemig).mockResolvedValue({ ok: false, motivo: 'credencial' });

    await cadastrarAction({ usuario: '10240099', senhaCotemig: 'a', senhaApp: 'minhasenha' });
    await cadastrarAction({ usuario: '10240099', senhaCotemig: 'b', senhaApp: 'minhasenha' });
    const terceira = await cadastrarAction({ usuario: '10240099', senhaCotemig: 'c', senhaApp: 'minhasenha' });

    expect(terceira).toMatchObject({ ok: false, error: { code: 'MUITAS_TENTATIVAS' } });
    if (!terceira.ok) expect(terceira.error.retryAfter).toBeGreaterThan(0);

    const chamadasAntes = vi.mocked(buscarPerfilCotemig).mock.calls.length;
    await cadastrarAction({ usuario: '10240099', senhaCotemig: 'd', senhaApp: 'minhasenha' });

    // Bloqueado significa não sair para a API do colégio de novo.
    expect(vi.mocked(buscarPerfilCotemig).mock.calls.length).toBe(chamadasAntes);
  });

  it('o mesmo aluno não consegue duas contas na feira', async () => {
    perfilOk();
    await cadastrarAction({ usuario: '10240099', senhaCotemig: 'x', senhaApp: 'primeira' });
    await cadastrarAction({ usuario: '10240099', senhaCotemig: 'x', senhaApp: 'segunda' });

    expect(await prisma.user.count({ where: { cotemigId: '10240099' } })).toBe(1);
  });

  it('depois de cadastrado, o login entra sem tocar na API do Cotemig', async () => {
    perfilOk();
    await cadastrarAction({ usuario: '10240099', senhaCotemig: 'x', senhaApp: 'minhasenha' });

    vi.clearAllMocks();

    const login = await loginComSenhaAction({
      email: '10240099@aluno.cotemig.com.br',
      senha: 'minhasenha',
    });

    expect(login).toMatchObject({ ok: true, data: { rota: '/carteira' } });
    expect(buscarPerfilCotemig).not.toHaveBeenCalled();
  });

  it('conta bloqueada não é reaberta pelo cadastro', async () => {
    perfilOk();
    await cadastrarAction({ usuario: '10240099', senhaCotemig: 'x', senhaApp: 'minhasenha' });
    await prisma.user.update({ where: { cotemigId: '10240099' }, data: { bloqueado: true } });

    const r = await cadastrarAction({ usuario: '10240099', senhaCotemig: 'x', senhaApp: 'outra' });
    expect(r).toMatchObject({ ok: false, error: { code: 'CONTA_BLOQUEADA' } });
  });

  it('login errado repetido bloqueia e devolve o tempo de espera', async () => {
    process.env.RATE_LIMIT_FALHAS = '3';
    process.env.RATE_LIMIT_BLOQUEIO_SEG = '60';

    perfilOk();
    await cadastrarAction({ usuario: '10240099', senhaCotemig: 'x', senhaApp: 'minhasenha' });

    const email = '10240099@aluno.cotemig.com.br';
    await loginComSenhaAction({ email, senha: 'errada' });
    await loginComSenhaAction({ email, senha: 'errada' });
    const terceira = await loginComSenhaAction({ email, senha: 'errada' });

    expect(terceira).toMatchObject({ ok: false, error: { code: 'MUITAS_TENTATIVAS' } });

    // Bloqueado vale inclusive para a senha certa: o balde é por identidade.
    const comSenhaCerta = await loginComSenhaAction({ email, senha: 'minhasenha' });
    expect(comSenhaCerta).toMatchObject({ ok: false, error: { code: 'MUITAS_TENTATIVAS' } });
  });

  it('conta inexistente e conta existente respondem a mesma coisa', async () => {
    perfilOk();
    await cadastrarAction({ usuario: '10240099', senhaCotemig: 'x', senhaApp: 'minhasenha' });

    const existente = await loginComSenhaAction({
      email: '10240099@aluno.cotemig.com.br',
      senha: 'errada',
    });
    const inexistente = await loginComSenhaAction({
      email: '99999999@aluno.cotemig.com.br',
      senha: 'errada',
    });

    expect(existente).toEqual(inexistente);
  });
});
