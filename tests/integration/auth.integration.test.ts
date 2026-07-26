import { it, expect } from 'vitest';
import { prisma } from '@/lib/prisma';
import { entrarComSenha, entrarComGoogle, garantirAluno } from '@/domain/auth';
import { describeDb } from '../helpers/db';

describeDb('Auth (integração, Postgres real)', () => {
  it('primeiro login por senha cria a conta; carteira = prefixo do email', async () => {
    const u = await entrarComSenha(prisma, { email: '12345@aluno.cotemig.com.br', senha: 'segredo' });
    expect(u.codigoCarteira).toBe('12345');
    expect(u.papel).toBe('participante');
    expect(u.senhaHash).toBeTruthy();
  });

  it('login seguinte valida a senha (errada rejeita, certa entra)', async () => {
    await entrarComSenha(prisma, { email: 'aluno@aluno.cotemig.com.br', senha: 'certa' });
    await expect(
      entrarComSenha(prisma, { email: 'aluno@aluno.cotemig.com.br', senha: 'errada' }),
    ).rejects.toMatchObject({ code: 'CREDENCIAL_INVALIDA' });
    const ok = await entrarComSenha(prisma, { email: 'aluno@aluno.cotemig.com.br', senha: 'certa' });
    expect(ok.email).toBe('aluno@aluno.cotemig.com.br');
  });

  it('Google provisiona conta sem senha e reaproveita no login seguinte', async () => {
    const a = await entrarComGoogle(prisma, { email: 'g@aluno.cotemig.com.br' });
    expect(a.provider).toBe('google');
    expect(a.senhaHash).toBeNull();
    const b = await entrarComGoogle(prisma, { email: 'g@aluno.cotemig.com.br' });
    expect(b.id).toBe(a.id);
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
    const barroca = await entrarComSenha(prisma, { email: '10231234@aluno.cotemig.com.br', senha: 'x1234' });
    expect(barroca.unidade).toBe('barroca');
    expect(barroca.pendente).toBe(false);

    const floresta = await entrarComSenha(prisma, { email: '20231234@aluno.cotemig.com.br', senha: 'x1234' });
    expect(floresta.unidade).toBe('floresta');
    expect(floresta.pendente).toBe(false);
  });

  it('email fora do padrão de matrícula → conta PENDENTE', async () => {
    const g = await entrarComGoogle(prisma, { email: 'joao.silva@gmail.com' });
    expect(g.pendente).toBe(true);

    const s = await entrarComSenha(prisma, { email: 'maria@empresa.com', senha: 'segredo' });
    expect(s.pendente).toBe(true);
  });

  it('garantirAluno pela matrícula define a unidade pela regra', async () => {
    const { user } = await garantirAluno(prisma, { identificador: '2555' });
    expect(user.unidade).toBe('floresta');
    expect(user.pendente).toBe(false);
  });

  it('conta pré-provisionada: primeiro login por senha reivindica (define a senha)', async () => {
    const { user } = await garantirAluno(prisma, { identificador: '777666' });
    expect(user.senhaHash).toBeNull();
    const logged = await entrarComSenha(prisma, { email: '777666@aluno.cotemig.com.br', senha: 'nova' });
    expect(logged.id).toBe(user.id);
    const recarregado = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(recarregado.senhaHash).toBeTruthy();
  });
});
