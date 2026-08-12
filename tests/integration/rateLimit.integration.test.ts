import { it, expect, beforeEach, afterEach } from 'vitest';
import { prisma } from '@/lib/prisma';
import {
  verificarRate,
  registrarTentativa,
  desbloquearIdentificador,
  limparExpirados,
} from '@/domain/rateLimit';
import { describeDb } from '../helpers/db';

const ENV_ORIGINAL = { ...process.env };

beforeEach(() => {
  process.env.RATE_LIMIT_ATIVO = 'true';
  process.env.RATE_LIMIT_IP_ATIVO = 'false';
  process.env.RATE_LIMIT_FALHAS = '3';
  process.env.RATE_LIMIT_JANELA_SEG = '900';
  process.env.RATE_LIMIT_BLOQUEIO_SEG = '60';
  process.env.RATE_LIMIT_BLOQUEIO_MAX_SEG = '3600';
});

afterEach(() => {
  process.env = { ...ENV_ORIGINAL };
});

async function falhar(identificador: string, ip: string | null = null) {
  return registrarTentativa(prisma, { escopo: 'login', identificador, ip, sucesso: false });
}

describeDb('Rate limiting (integração, Postgres real)', () => {
  it('libera até o limite e bloqueia na enésima falha', async () => {
    expect((await verificarRate(prisma, { escopo: 'login', identificador: 'a@x.com' })).bloqueado).toBe(false);

    expect((await falhar('a@x.com')).bloqueado).toBe(false);
    expect((await falhar('a@x.com')).bloqueado).toBe(false);

    const terceira = await falhar('a@x.com');
    expect(terceira.bloqueado).toBe(true);
    expect(terceira.segundosRestantes).toBeGreaterThan(0);
    expect(terceira.segundosRestantes).toBeLessThanOrEqual(60);

    expect((await verificarRate(prisma, { escopo: 'login', identificador: 'a@x.com' })).bloqueado).toBe(true);
  });

  it('o bloqueio é por identidade: outra conta não é afetada', async () => {
    await falhar('a@x.com');
    await falhar('a@x.com');
    await falhar('a@x.com');

    expect((await verificarRate(prisma, { escopo: 'login', identificador: 'b@x.com' })).bloqueado).toBe(false);
  });

  it('mesmo IP com contas diferentes não bloqueia enquanto o limite por IP está desligado', async () => {
    for (let i = 0; i < 10; i++) {
      await falhar(`aluno${i}@x.com`, '200.1.1.1');
    }

    for (let i = 0; i < 10; i++) {
      const estado = await verificarRate(prisma, {
        escopo: 'login',
        identificador: `aluno${i}@x.com`,
        ip: '200.1.1.1',
      });
      expect(estado.bloqueado).toBe(false);
    }
  });

  it('com o limite por IP ligado, muitas falhas do mesmo IP bloqueiam', async () => {
    process.env.RATE_LIMIT_IP_ATIVO = 'true';
    process.env.RATE_LIMIT_IP_FALHAS = '5';

    for (let i = 0; i < 5; i++) {
      await falhar(`outro${i}@x.com`, '200.2.2.2');
    }

    const estado = await verificarRate(prisma, {
      escopo: 'login',
      identificador: 'novissimo@x.com',
      ip: '200.2.2.2',
    });
    expect(estado.bloqueado).toBe(true);
  });

  it('backoff progressivo: cada falha extra aumenta a espera', async () => {
    await falhar('c@x.com');
    await falhar('c@x.com');
    const primeira = await falhar('c@x.com');
    const segunda = await falhar('c@x.com');
    const terceira = await falhar('c@x.com');

    expect(segunda.segundosRestantes).toBeGreaterThan(primeira.segundosRestantes);
    expect(terceira.segundosRestantes).toBeGreaterThan(segunda.segundosRestantes);
  });

  it('o backoff respeita o teto configurado', async () => {
    process.env.RATE_LIMIT_BLOQUEIO_MAX_SEG = '120';
    for (let i = 0; i < 12; i++) await falhar('teto@x.com');

    const estado = await verificarRate(prisma, { escopo: 'login', identificador: 'teto@x.com' });
    expect(estado.segundosRestantes).toBeLessThanOrEqual(120);
  });

  it('janela expirada reinicia a contagem em vez de somar', async () => {
    await falhar('d@x.com');
    await falhar('d@x.com');

    await prisma.baldeRate.update({
      where: { chave: 'login:id:d@x.com' },
      data: { janelaInicio: new Date(Date.now() - 3600 * 1000) },
    });

    const depois = await falhar('d@x.com');
    expect(depois.bloqueado).toBe(false);

    const balde = await prisma.baldeRate.findUniqueOrThrow({ where: { chave: 'login:id:d@x.com' } });
    expect(balde.falhas).toBe(1);
  });

  it('sucesso limpa o balde daquela identidade', async () => {
    await falhar('e@x.com');
    await falhar('e@x.com');

    await registrarTentativa(prisma, { escopo: 'login', identificador: 'e@x.com', sucesso: true });

    expect(await prisma.baldeRate.findUnique({ where: { chave: 'login:id:e@x.com' } })).toBeNull();
    expect((await verificarRate(prisma, { escopo: 'login', identificador: 'e@x.com' })).bloqueado).toBe(false);
  });

  it('admin desbloqueia manualmente', async () => {
    await falhar('f@x.com');
    await falhar('f@x.com');
    await falhar('f@x.com');
    expect((await verificarRate(prisma, { escopo: 'login', identificador: 'f@x.com' })).bloqueado).toBe(true);

    const r = await desbloquearIdentificador(prisma, 'F@X.COM');
    expect(r.removidos).toBeGreaterThan(0);
    expect((await verificarRate(prisma, { escopo: 'login', identificador: 'f@x.com' })).bloqueado).toBe(false);
  });

  it('contagem é atômica sob concorrência: 10 falhas simultâneas contam 10', async () => {
    await Promise.all(Array.from({ length: 10 }, () => falhar('corrida@x.com')));

    const balde = await prisma.baldeRate.findUniqueOrThrow({ where: { chave: 'login:id:corrida@x.com' } });
    expect(balde.falhas).toBe(10);
  });

  it('escopos diferentes têm baldes independentes', async () => {
    for (let i = 0; i < 5; i++) {
      await registrarTentativa(prisma, { escopo: 'cadastro', identificador: 'g@x.com', sucesso: false });
    }

    expect((await verificarRate(prisma, { escopo: 'cadastro', identificador: 'g@x.com' })).bloqueado).toBe(true);
    expect((await verificarRate(prisma, { escopo: 'login', identificador: 'g@x.com' })).bloqueado).toBe(false);
  });

  it('o cadastro bloqueia com menos falhas que o login', async () => {
    process.env.RATE_LIMIT_CADASTRO_FALHAS = '2';
    process.env.RATE_LIMIT_FALHAS = '5';

    await registrarTentativa(prisma, { escopo: 'cadastro', identificador: 'h@x.com', sucesso: false });
    const segunda = await registrarTentativa(prisma, {
      escopo: 'cadastro',
      identificador: 'h@x.com',
      sucesso: false,
    });

    expect(segunda.bloqueado).toBe(true);
  });

  it('toda tentativa vira auditoria, e a senha nunca é gravada', async () => {
    await falhar('i@x.com', '10.0.0.9');
    await registrarTentativa(prisma, { escopo: 'login', identificador: 'i@x.com', sucesso: true });

    const linhas = await prisma.tentativaAuth.findMany({ where: { identificador: 'i@x.com' } });
    expect(linhas).toHaveLength(2);
    expect(linhas.some((l) => l.sucesso)).toBe(true);
    expect(linhas.some((l) => !l.sucesso && l.ip === '10.0.0.9')).toBe(true);
    expect(Object.keys(linhas[0])).not.toContain('senha');
  });

  it('desligado por env var, nada é bloqueado (mas a auditoria continua)', async () => {
    process.env.RATE_LIMIT_ATIVO = 'false';

    for (let i = 0; i < 20; i++) await falhar('j@x.com');

    expect((await verificarRate(prisma, { escopo: 'login', identificador: 'j@x.com' })).bloqueado).toBe(false);
    expect(await prisma.tentativaAuth.count({ where: { identificador: 'j@x.com' } })).toBe(20);
  });

  it('limpeza remove tentativas e baldes vencidos, preservando bloqueio ativo', async () => {
    process.env.RATE_LIMIT_RETENCAO_HORAS = '1';

    await falhar('velho@x.com');
    await prisma.tentativaAuth.updateMany({
      where: { identificador: 'velho@x.com' },
      data: { createdAt: new Date(Date.now() - 5 * 3600 * 1000) },
    });
    await prisma.baldeRate.update({
      where: { chave: 'login:id:velho@x.com' },
      data: { atualizadoEm: new Date(Date.now() - 5 * 3600 * 1000) },
    });

    await falhar('novo@x.com');
    await falhar('novo@x.com');
    await falhar('novo@x.com');

    const r = await limparExpirados(prisma);
    expect(r.tentativas).toBeGreaterThan(0);
    expect(r.baldes).toBeGreaterThan(0);

    expect(await prisma.baldeRate.findUnique({ where: { chave: 'login:id:velho@x.com' } })).toBeNull();
    expect((await verificarRate(prisma, { escopo: 'login', identificador: 'novo@x.com' })).bloqueado).toBe(true);
  });
});
