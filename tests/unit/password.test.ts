import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { scryptSync, randomBytes } from 'node:crypto';
import { hashSenha, verificarSenha, precisaRehash, custoAtual } from '@/lib/password';

const N_ORIGINAL = process.env.SCRYPT_N;

beforeAll(() => {
  process.env.SCRYPT_N = '16384';
});

afterAll(() => {
  if (N_ORIGINAL === undefined) delete process.env.SCRYPT_N;
  else process.env.SCRYPT_N = N_ORIGINAL;
});

function hashLegado(senha: string): string {
  const salt = randomBytes(16).toString('hex');
  return `${salt}:${scryptSync(senha, salt, 64).toString('hex')}`;
}

describe('password', () => {
  it('grava o custo dentro do hash, no formato versionado', async () => {
    const h = await hashSenha('segredo');
    const [algoritmo, n, r, p, salt, chave] = h.split('$');
    expect(algoritmo).toBe('scrypt');
    expect(Number(n)).toBe(16384);
    expect(Number(r)).toBe(8);
    expect(Number(p)).toBe(1);
    expect(salt).toHaveLength(32);
    expect(chave).toHaveLength(128);
  });

  it('verifica a senha certa e rejeita a errada', async () => {
    const h = await hashSenha('segredo');
    expect(await verificarSenha('segredo', h)).toBe(true);
    expect(await verificarSenha('outra', h)).toBe(false);
  });

  it('continua verificando o formato legado salt:hash', async () => {
    const legado = hashLegado('segredo');
    expect(await verificarSenha('segredo', legado)).toBe(true);
    expect(await verificarSenha('errada', legado)).toBe(false);
  });

  it('hash legado pede rehash quando o custo alvo é maior', () => {
    const legado = hashLegado('segredo');
    process.env.SCRYPT_N = '65536';
    expect(custoAtual().N).toBe(65536);
    expect(precisaRehash(legado)).toBe(true);
    process.env.SCRYPT_N = '16384';
  });

  it('hash no custo atual não pede rehash', async () => {
    const h = await hashSenha('segredo');
    expect(precisaRehash(h)).toBe(false);
  });

  it('hash corrompido não verifica e não estoura', async () => {
    expect(await verificarSenha('segredo', 'lixo')).toBe(false);
    expect(await verificarSenha('segredo', 'scrypt$naoNumero$8$1$aa$bb')).toBe(false);
    expect(precisaRehash('lixo')).toBe(true);
  });

  it('SCRYPT_N inválido cai no padrão de produção, nunca abaixo do legado', () => {
    process.env.SCRYPT_N = '100';
    expect(custoAtual().N).toBe(131072);
    process.env.SCRYPT_N = 'abc';
    expect(custoAtual().N).toBe(131072);
    process.env.SCRYPT_N = '16384';
  });
});
