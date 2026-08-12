import { proxiesConfiaveis } from './rateLimitConfig';

export function ipDoCabecalho(xff: string | null, proxies = proxiesConfiaveis()): string | null {
  if (proxies <= 0 || !xff) return null;

  const partes = xff
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);

  const indice = partes.length - proxies;
  return indice >= 0 && indice < partes.length ? partes[indice] : null;
}

export async function ipDaRequisicao(): Promise<string | null> {
  try {
    const { headers } = await import('next/headers');
    const h = await headers();
    return ipDoCabecalho(h.get('x-forwarded-for'));
  } catch {
    return null;
  }
}
