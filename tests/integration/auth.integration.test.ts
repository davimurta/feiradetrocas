import { it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '@/lib/prisma';
import { entrarComSenha, entrarComGoogle, garantirAluno, definirSenhaLocal } from '@/domain/auth';
import { hashSenha } from '@/lib/password';
import { invalidarSessoes } from '@/domain/sessao';
import { describeDb } from '../helpers/db';
import { criarUsuario } from '../helpers/factories';

const N_ORIGINAL = process.env.SCRYPT_N;

beforeAll(() => {
  process.env.SCRYPT_N = '16384';
});

afterAll(() => {
  if (N_ORIGINAL === undefined) delete process.env.SCRYPT_N;
  else process.env.SCRYPT_N = N_ORIGINAL;
});

describeDb('Auth (integração, Postgres real)', () => {
  it('login não cria conta: email desconhecido é CREDENCIAL_INVALIDA', async () => {
    await expect(
      entrarComSenha(prisma, { email: 'ninguem@aluno.cotemig.com.br', senha: 'segredo' }),
    ).rejects.toMatchObject({ code: 'CREDENCIAL_INVALIDA' });

    const criada = await prisma.user.findUnique({ where: { email: 'ninguem@aluno.cotemig.com.br' } });
    expect(criada).toBeNull();
  });

  it('conta pré-provisionada NÃO é reivindicada pelo login: senha não é gravada', async () => {
    const { user } = await garantirAluno(prisma, { identificador: '777666' });
    expect(user.senhaHash).toBeNull();

    await expect(
      entrarComSenha(prisma, { email: '777666@aluno.cotemig.com.br', senha: 'nova' }),
    ).rejects.toMatchObject({ code: 'CREDENCIAL_INVALIDA' });

    const depois = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(depois.senhaHash).toBeNull();
  });

  it('mesma resposta para conta inexistente e para conta sem senha', async () => {
    await garantirAluno(prisma, { identificador: '555444' });

    const semSenha = await entrarComSenha(prisma, { email: '555444@aluno.cotemig.com.br', senha: 'x' })
      .then(() => null)
      .catch((e) => ({ code: e.code, message: e.message }));
    const inexistente = await entrarComSenha(prisma, { email: '000111@aluno.cotemig.com.br', senha: 'x' })
      .then(() => null)
      .catch((e) => ({ code: e.code, message: e.message }));

    expect(semSenha).toEqual(inexistente);
  });

  it('login com senha certa entra; senha errada é rejeitada', async () => {
    const u = await criarUsuario({
      email: 'aluno@aluno.cotemig.com.br',
      senhaHash: await hashSenha('certa'),
    });

    const logado = await entrarComSenha(prisma, { email: 'aluno@aluno.cotemig.com.br', senha: 'certa' });
    expect(logado.id).toBe(u.id);

    await expect(
      entrarComSenha(prisma, { email: 'aluno@aluno.cotemig.com.br', senha: 'errada' }),
    ).rejects.toMatchObject({ code: 'CREDENCIAL_INVALIDA' });
  });

  it('conta bloqueada não entra nem com a senha certa', async () => {
    await criarUsuario({
      email: 'bloqueado@aluno.cotemig.com.br',
      senhaHash: await hashSenha('certa'),
    });
    await prisma.user.update({
      where: { email: 'bloqueado@aluno.cotemig.com.br' },
      data: { bloqueado: true },
    });

    await expect(
      entrarComSenha(prisma, { email: 'bloqueado@aluno.cotemig.com.br', senha: 'certa' }),
    ).rejects.toMatchObject({ code: 'CONTA_BLOQUEADA' });
  });

  it('hash antigo é reescrito no custo novo após um login bem-sucedido', async () => {
    process.env.SCRYPT_N = '16384';
    const antigo = await hashSenha('certa');
    process.env.SCRYPT_N = '32768';

    const u = await criarUsuario({ email: 'rehash@aluno.cotemig.com.br', senhaHash: antigo });
    const logado = await entrarComSenha(prisma, { email: 'rehash@aluno.cotemig.com.br', senha: 'certa' });

    expect(logado.id).toBe(u.id);
    expect(logado.senhaHash).not.toBe(antigo);
    expect(logado.senhaHash?.startsWith('scrypt$32768$')).toBe(true);

    const relogin = await entrarComSenha(prisma, { email: 'rehash@aluno.cotemig.com.br', senha: 'certa' });
    expect(relogin.id).toBe(u.id);
    process.env.SCRYPT_N = '16384';
  });

  it('definirSenhaLocal grava a senha e invalida as sessões antigas', async () => {
    const u = await criarUsuario({ email: 'novasenha@aluno.cotemig.com.br', senhaHash: null });
    expect(u.sessionVersion).toBe(0);

    const atualizado = await definirSenhaLocal(prisma, { userId: u.id, senha: 'minhasenha' });
    expect(atualizado.sessionVersion).toBe(1);

    const logado = await entrarComSenha(prisma, {
      email: 'novasenha@aluno.cotemig.com.br',
      senha: 'minhasenha',
    });
    expect(logado.id).toBe(u.id);
  });

  it('invalidarSessoes incrementa a versão da sessão', async () => {
    const u = await criarUsuario({ email: 'sessao@aluno.cotemig.com.br' });
    await invalidarSessoes(prisma, u.id);
    await invalidarSessoes(prisma, u.id);
    const depois = await prisma.user.findUniqueOrThrow({ where: { id: u.id } });
    expect(depois.sessionVersion).toBe(2);
  });

  it('garantirAluno cria conta pré-provisionada e a reaproveita', async () => {
    const a = await garantirAluno(prisma, { identificador: '999888' });
    expect(a.criado).toBe(true);
    expect(a.user.codigoCarteira).toBe('999888');
    const b = await garantirAluno(prisma, { identificador: '999888' });
    expect(b.criado).toBe(false);
    expect(b.user.id).toBe(a.user.id);
  });

  it('regra da unidade: matrícula 1… → Barroca, 2… → Floresta; conta ativa', async () => {
    const barroca = await garantirAluno(prisma, { identificador: '10231234' });
    expect(barroca.user.unidade).toBe('barroca');
    expect(barroca.user.pendente).toBe(false);

    const floresta = await garantirAluno(prisma, { identificador: '20231234' });
    expect(floresta.user.unidade).toBe('floresta');
    expect(floresta.user.pendente).toBe(false);
  });

  it('email fora do padrão de matrícula → conta PENDENTE', async () => {
    const g = await entrarComGoogle(prisma, { email: 'joao.silva@gmail.com' });
    expect(g.pendente).toBe(true);
  });

  it('Google provisiona conta sem senha e reaproveita no login seguinte', async () => {
    const a = await entrarComGoogle(prisma, { email: 'g@aluno.cotemig.com.br' });
    expect(a.provider).toBe('google');
    expect(a.senhaHash).toBeNull();
    const b = await entrarComGoogle(prisma, { email: 'g@aluno.cotemig.com.br' });
    expect(b.id).toBe(a.id);
  });

  it('conta provisionada pelo Google não vira porta de entrada por senha', async () => {
    await entrarComGoogle(prisma, { email: 'so.google@aluno.cotemig.com.br' });
    await expect(
      entrarComSenha(prisma, { email: 'so.google@aluno.cotemig.com.br', senha: 'qualquer' }),
    ).rejects.toMatchObject({ code: 'CREDENCIAL_INVALIDA' });
  });
});
