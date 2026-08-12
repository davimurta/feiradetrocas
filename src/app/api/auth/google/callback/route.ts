import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/prisma';
import { getCurrentUser, rotaInicial } from '@/lib/auth';
import { setSession } from '@/lib/session';
import { configGoogle, comparaSegura, trocarCodigoPorIdentidade, PROVIDER } from '@/lib/google';

export const dynamic = 'force-dynamic';

const COOKIE = 'google_oauth';

interface EstadoSalvo {
  state: string;
  nonce: string;
  verifier: string;
  modo: 'login' | 'vincular';
}

function erro(req: Request, destino: string, codigo: string): Response {
  return NextResponse.redirect(new URL(`${destino}?erro=${codigo}`, req.url));
}

export async function GET(req: Request): Promise<Response> {
  const cfg = configGoogle();
  if (!cfg) return erro(req, '/login', 'google_desativado');

  const url = new URL(req.url);
  const store = await cookies();
  const bruto = store.get(COOKIE)?.value;
  store.delete(COOKIE);

  if (!bruto) return erro(req, '/login', 'sessao_oauth_expirada');

  let salvo: EstadoSalvo;
  try {
    salvo = JSON.parse(bruto) as EstadoSalvo;
  } catch {
    return erro(req, '/login', 'sessao_oauth_invalida');
  }

  const destino = salvo.modo === 'vincular' ? '/conta' : '/login';

  const state = url.searchParams.get('state');
  const code = url.searchParams.get('code');
  if (!state || !code || !comparaSegura(state, salvo.state)) {
    return erro(req, destino, 'state_invalido');
  }

  const resultado = await trocarCodigoPorIdentidade(cfg, {
    code,
    verifier: salvo.verifier,
    nonce: salvo.nonce,
  });
  if (!resultado.ok) return erro(req, destino, resultado.motivo);

  const { sub, email } = resultado.identidade;
  const vinculo = await prisma.contaExterna.findUnique({
    where: { provider_providerAccountId: { provider: PROVIDER, providerAccountId: sub } },
  });

  if (salvo.modo === 'vincular') {
    const user = await getCurrentUser();
    if (!user) return erro(req, '/login', 'sessao_expirada');
    if (vinculo && vinculo.userId !== user.id) return erro(req, '/conta', 'google_em_uso');

    await prisma.contaExterna.upsert({
      where: { provider_providerAccountId: { provider: PROVIDER, providerAccountId: sub } },
      create: { provider: PROVIDER, providerAccountId: sub, email, userId: user.id },
      update: { email },
    });

    return NextResponse.redirect(new URL('/conta?ok=google_vinculado', req.url));
  }

  if (!vinculo) return erro(req, '/login', 'google_sem_vinculo');

  const user = await prisma.user.findUnique({
    where: { id: vinculo.userId },
    select: { id: true, papel: true, pendente: true, bloqueado: true, sessionVersion: true },
  });
  if (!user) return erro(req, '/login', 'conta_inexistente');
  if (user.bloqueado) return erro(req, '/login', 'conta_bloqueada');

  await setSession(user.id, user.sessionVersion);
  return NextResponse.redirect(
    new URL(user.pendente ? '/pendente' : rotaInicial(user.papel), req.url),
  );
}
