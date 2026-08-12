import { scrypt, randomBytes, timingSafeEqual, type ScryptOptions } from 'node:crypto';

function scryptAsync(senha: string, salt: string, keylen: number, opts: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(senha, salt, keylen, opts, (err, chave) => (err ? reject(err) : resolve(chave)));
  });
}

const KEYLEN = 64;
const N_PADRAO = 131072;
const R_PADRAO = 8;
const P_PADRAO = 1;

const N_LEGADO = 16384;
const R_LEGADO = 8;
const P_LEGADO = 1;

const SALT_EQUALIZADOR = 'f1e2d3c4b5a6978877665544332211ff';

export interface CustoScrypt {
  N: number;
  r: number;
  p: number;
}

function potenciaDeDois(n: number): boolean {
  return Number.isInteger(n) && n > 1 && (n & (n - 1)) === 0;
}

export function custoAtual(): CustoScrypt {
  const bruto = Number(process.env.SCRYPT_N);
  const N = potenciaDeDois(bruto) && bruto >= N_LEGADO ? bruto : N_PADRAO;
  return { N, r: R_PADRAO, p: P_PADRAO };
}

function derivar(senha: string, salt: string, custo: CustoScrypt): Promise<Buffer> {
  const maxmem = 128 * custo.N * custo.r * 2 + 1024 * 1024;
  return scryptAsync(senha, salt, KEYLEN, { ...custo, maxmem });
}

interface HashDecodificado {
  custo: CustoScrypt;
  salt: string;
  chave: Buffer;
}

function decodificar(armazenado: string): HashDecodificado | null {
  if (armazenado.startsWith('scrypt$')) {
    const [, n, r, p, salt, chave] = armazenado.split('$');
    const custo = { N: Number(n), r: Number(r), p: Number(p) };
    if (!potenciaDeDois(custo.N) || !custo.r || !custo.p || !salt || !chave) return null;
    return { custo, salt, chave: Buffer.from(chave, 'hex') };
  }

  const [salt, chave] = armazenado.split(':');
  if (!salt || !chave) return null;
  return { custo: { N: N_LEGADO, r: R_LEGADO, p: P_LEGADO }, salt, chave: Buffer.from(chave, 'hex') };
}

export async function hashSenha(senha: string): Promise<string> {
  const custo = custoAtual();
  const salt = randomBytes(16).toString('hex');
  const chave = await derivar(senha, salt, custo);
  return `scrypt$${custo.N}$${custo.r}$${custo.p}$${salt}$${chave.toString('hex')}`;
}

export async function verificarSenha(senha: string, armazenado: string): Promise<boolean> {
  const decodificado = decodificar(armazenado);
  if (!decodificado) {
    await consumirTempoDeSenha(senha);
    return false;
  }
  const derivada = await derivar(senha, decodificado.salt, decodificado.custo);
  return decodificado.chave.length === derivada.length && timingSafeEqual(decodificado.chave, derivada);
}

export function precisaRehash(armazenado: string): boolean {
  const decodificado = decodificar(armazenado);
  if (!decodificado) return true;
  const alvo = custoAtual();
  return decodificado.custo.N < alvo.N || decodificado.custo.r !== alvo.r || decodificado.custo.p !== alvo.p;
}

export async function consumirTempoDeSenha(senha: string): Promise<void> {
  await derivar(senha, SALT_EQUALIZADOR, custoAtual());
}
