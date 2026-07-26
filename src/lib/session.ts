import { createHmac, timingSafeEqual } from 'node:crypto';

const COOKIE = 'feira_session';

function secret(): string {
  return process.env.SESSION_SECRET || 'dev-inseguro-troque-em-producao';
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

export async function setSession(userId: string): Promise<void> {
  const { cookies } = await import('next/headers');
  const store = await cookies();
  store.set(COOKIE, assinar(userId), {
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

export async function readSessionUserId(): Promise<string | null> {
  try {
    const { cookies } = await import('next/headers');
    const store = await cookies();
    const token = store.get(COOKIE)?.value;
    return token ? verificar(token) : null;
  } catch {
    return null;
  }
}
