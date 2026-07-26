import { scrypt, randomBytes, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify(scrypt);
const KEYLEN = 64;

export async function hashSenha(senha: string): Promise<string> {
  const salt = randomBytes(16).toString('hex');
  const derived = (await scryptAsync(senha, salt, KEYLEN)) as Buffer;
  return `${salt}:${derived.toString('hex')}`;
}

export async function verificarSenha(senha: string, hashArmazenado: string): Promise<boolean> {
  const [salt, key] = hashArmazenado.split(':');
  if (!salt || !key) return false;
  const derived = (await scryptAsync(senha, salt, KEYLEN)) as Buffer;
  const keyBuf = Buffer.from(key, 'hex');
  return keyBuf.length === derived.length && timingSafeEqual(keyBuf, derived);
}
