import { createHmac, timingSafeEqual } from 'node:crypto';
import { validarSegredo, SEGREDO_DEV } from './segredo';

const COOKIE = 'feira_session';

function secret(): string {
  const valor = process.env.SESSION_SECRET;
  if (process.env.NODE_ENV === 'production') {
    const problema = validarSegredo(valor);
    if (problema) {
      throw new Error(
        `${problema} Gere um valor aleatório com: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`,
      );
    }
  }
  return valor || SEGREDO_DEV;
}

function assinar(valor: string): string {
  const sig = createHmac('sha256', secret()).update(valor).digest('base64url');
  return `${valor}.${sig}`;
}

function verificar(token: string): string | null {
  const i = token.lastIndexOf('.');
  if (i < 0) return null;
  const valor = token.slice(0, i);
  const sig = token.slice(i + 1);
  const esperado = createHmac('sha256', secret()).update(valor).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(esperado);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  return valor;
}

export interface SessaoLida {
  userId: string;
  versao: number;
}

export async function setSession(userId: string, versao: number): Promise<void> {
  const { cookies } = await import('next/headers');
  const store = await cookies();
  store.set(COOKIE, assinar(`${userId}.${versao}`), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 7,
  });
}

export async function clearSession(): Promise<void> {
  const { cookies } = await import('next/headers');
  const store = await cookies();
  store.delete(COOKIE);
}

export async function readSession(): Promise<SessaoLida | null> {
  try {
    const { cookies } = await import('next/headers');
    const store = await cookies();
    const token = store.get(COOKIE)?.value;
    if (!token) return null;

    const payload = verificar(token);
    if (!payload) return null;

    const corte = payload.lastIndexOf('.');
    if (corte < 0) return null;

    const userId = payload.slice(0, corte);
    const versao = Number(payload.slice(corte + 1));
    if (!userId || !Number.isInteger(versao) || versao < 0) return null;

    return { userId, versao };
  } catch {
    return null;
  }
}
