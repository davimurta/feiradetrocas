import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { configGoogle, novoDesafio, urlDeAutorizacao } from '@/lib/google';
import { getCurrentUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

const COOKIE = 'google_oauth';

export async function GET(req: Request): Promise<Response> {
  const cfg = configGoogle();
  if (!cfg) return NextResponse.redirect(new URL('/login?erro=google_desativado', req.url));

  const modo = new URL(req.url).searchParams.get('modo') === 'vincular' ? 'vincular' : 'login';

  if (modo === 'vincular') {
    const user = await getCurrentUser();
    if (!user) return NextResponse.redirect(new URL('/login', req.url));
  }

  const desafio = novoDesafio();
  const store = await cookies();
  store.set(COOKIE, JSON.stringify({ ...desafio, modo }), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 600,
  });

  return NextResponse.redirect(urlDeAutorizacao(cfg, desafio));
}
