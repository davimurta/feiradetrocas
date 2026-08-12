import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

const AUTORIZACAO = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN = 'https://oauth2.googleapis.com/token';

const EMISSORES = new Set(['https://accounts.google.com', 'accounts.google.com']);

const DOMINIOS_PADRAO = 'cotemig.com.br,aluno.cotemig.com.br,faculdadecotemig.br,aluno.faculdadecotemig.br';

export const PROVIDER = 'google';

export interface ConfigGoogle {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  dominios: string[];
  hd: string | null;
}

export function googleHabilitado(): boolean {
  const flag = process.env.GOOGLE_AUTH_ENABLED;
  return flag === '1' || flag?.toLowerCase() === 'true';
}

export function configGoogle(): ConfigGoogle | null {
  if (!googleHabilitado()) return null;

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) return null;

  const dominios = (process.env.GOOGLE_DOMINIOS || DOMINIOS_PADRAO)
    .split(',')
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean);

  return { clientId, clientSecret, redirectUri, dominios, hd: process.env.GOOGLE_HD || null };
}

export interface DesafioPkce {
  state: string;
  nonce: string;
  verifier: string;
}

export function novoDesafio(): DesafioPkce {
  return {
    state: randomBytes(24).toString('base64url'),
    nonce: randomBytes(24).toString('base64url'),
    verifier: randomBytes(48).toString('base64url'),
  };
}

export function desafioDoVerifier(verifier: string): string {
  return createHash('sha256').update(verifier).digest('base64url');
}

export function comparaSegura(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export function urlDeAutorizacao(cfg: ConfigGoogle, desafio: DesafioPkce): string {
  const url = new URL(AUTORIZACAO);
  url.searchParams.set('client_id', cfg.clientId);
  url.searchParams.set('redirect_uri', cfg.redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', 'openid email profile');
  url.searchParams.set('state', desafio.state);
  url.searchParams.set('nonce', desafio.nonce);
  url.searchParams.set('code_challenge', desafioDoVerifier(desafio.verifier));
  url.searchParams.set('code_challenge_method', 'S256');
  url.searchParams.set('access_type', 'online');
  url.searchParams.set('prompt', 'select_account');
  if (cfg.hd) url.searchParams.set('hd', cfg.hd);
  return url.toString();
}

export interface IdentidadeGoogle {
  sub: string;
  email: string;
  nome: string | null;
  hd: string | null;
}

export type ResultadoGoogle =
  | { ok: true; identidade: IdentidadeGoogle }
  | { ok: false; motivo: 'troca_falhou' | 'token_invalido' | 'email_nao_verificado' | 'dominio_recusado' };

function decodificarPayload(idToken: string): Record<string, unknown> | null {
  const partes = idToken.split('.');
  if (partes.length !== 3) return null;
  try {
    return JSON.parse(Buffer.from(partes[1], 'base64url').toString('utf8'));
  } catch {
    return null;
  }
}

function dominioDoEmail(email: string): string {
  return email.split('@')[1]?.toLowerCase() ?? '';
}

export async function trocarCodigoPorIdentidade(
  cfg: ConfigGoogle,
  entrada: { code: string; verifier: string; nonce: string },
): Promise<ResultadoGoogle> {
  let resposta: Response;

  try {
    resposta = await fetch(TOKEN, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: cfg.clientId,
        client_secret: cfg.clientSecret,
        redirect_uri: cfg.redirectUri,
        grant_type: 'authorization_code',
        code: entrada.code,
        code_verifier: entrada.verifier,
      }),
      cache: 'no-store',
    });
  } catch {
    return { ok: false, motivo: 'troca_falhou' };
  }

  if (!resposta.ok) return { ok: false, motivo: 'troca_falhou' };

  let corpo: { id_token?: string };
  try {
    corpo = (await resposta.json()) as { id_token?: string };
  } catch {
    return { ok: false, motivo: 'troca_falhou' };
  }

  if (!corpo.id_token) return { ok: false, motivo: 'troca_falhou' };

  const payload = decodificarPayload(corpo.id_token);
  if (!payload) return { ok: false, motivo: 'token_invalido' };

  const iss = String(payload.iss ?? '');
  const aud = String(payload.aud ?? '');
  const exp = Number(payload.exp ?? 0);
  const nonce = String(payload.nonce ?? '');
  const sub = String(payload.sub ?? '');
  const email = String(payload.email ?? '').toLowerCase();

  if (!EMISSORES.has(iss)) return { ok: false, motivo: 'token_invalido' };
  if (aud !== cfg.clientId) return { ok: false, motivo: 'token_invalido' };
  if (!Number.isFinite(exp) || exp * 1000 <= Date.now()) return { ok: false, motivo: 'token_invalido' };
  if (!nonce || !comparaSegura(nonce, entrada.nonce)) return { ok: false, motivo: 'token_invalido' };
  if (!sub || !email) return { ok: false, motivo: 'token_invalido' };

  if (payload.email_verified !== true) return { ok: false, motivo: 'email_nao_verificado' };

  const hd = payload.hd ? String(payload.hd).toLowerCase() : null;
  const dominio = dominioDoEmail(email);
  const permitido = cfg.dominios.includes(dominio) || (hd !== null && cfg.dominios.includes(hd));
  if (!permitido) return { ok: false, motivo: 'dominio_recusado' };

  return {
    ok: true,
    identidade: {
      sub,
      email,
      nome: payload.name ? String(payload.name) : null,
      hd,
    },
  };
}
