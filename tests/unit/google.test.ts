import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  googleHabilitado,
  configGoogle,
  novoDesafio,
  desafioDoVerifier,
  urlDeAutorizacao,
  trocarCodigoPorIdentidade,
  type ConfigGoogle,
} from '@/lib/google';

const ENV_ORIGINAL = { ...process.env };

const CFG: ConfigGoogle = {
  clientId: 'cliente.apps.googleusercontent.com',
  clientSecret: 'segredo',
  redirectUri: 'https://feira.exemplo.br/api/auth/google/callback',
  dominios: ['cotemig.com.br', 'aluno.cotemig.com.br'],
  hd: 'cotemig.com.br',
};

function idToken(payload: Record<string, unknown>): string {
  const parte = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
  return `${parte({ alg: 'RS256' })}.${parte(payload)}.assinatura`;
}

function payloadValido(over: Record<string, unknown> = {}) {
  return {
    iss: 'https://accounts.google.com',
    aud: CFG.clientId,
    exp: Math.floor(Date.now() / 1000) + 600,
    sub: '11223344',
    email: '10240099@aluno.cotemig.com.br',
    email_verified: true,
    hd: 'cotemig.com.br',
    nonce: 'nonce-certo',
    name: 'Ana Aluna',
    ...over,
  };
}

let corpos: string[] = [];

function respondeComToken(payload: Record<string, unknown>) {
  return vi.fn(async (_url: string | URL | Request, init: RequestInit = {}) => {
    corpos.push(String(init.body ?? ''));
    return new Response(JSON.stringify({ id_token: idToken(payload) }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  });
}

async function trocar(payload: Record<string, unknown>) {
  vi.stubGlobal('fetch', respondeComToken(payload));
  return trocarCodigoPorIdentidade(CFG, { code: 'c', verifier: 'v', nonce: 'nonce-certo' });
}

beforeEach(() => {
  process.env = { ...ENV_ORIGINAL };
});

afterEach(() => {
  vi.unstubAllGlobals();
  process.env = { ...ENV_ORIGINAL };
});

describe('flag do Google', () => {
  it('vem desligado por padrão', () => {
    delete process.env.GOOGLE_AUTH_ENABLED;
    expect(googleHabilitado()).toBe(false);
    expect(configGoogle()).toBeNull();
  });

  it('desligado explicitamente continua desligado', () => {
    process.env.GOOGLE_AUTH_ENABLED = 'false';
    expect(googleHabilitado()).toBe(false);
  });

  it('ligado sem credenciais completas não devolve config', () => {
    process.env.GOOGLE_AUTH_ENABLED = 'true';
    process.env.GOOGLE_CLIENT_ID = 'x';
    expect(configGoogle()).toBeNull();
  });

  it('ligado e completo devolve config com os dois domínios do colégio', () => {
    process.env.GOOGLE_AUTH_ENABLED = 'true';
    process.env.GOOGLE_CLIENT_ID = 'x';
    process.env.GOOGLE_CLIENT_SECRET = 'y';
    process.env.GOOGLE_REDIRECT_URI = 'https://ex.br/cb';

    const cfg = configGoogle();
    expect(cfg?.dominios).toContain('cotemig.com.br');
    expect(cfg?.dominios).toContain('aluno.cotemig.com.br');
  });
});

describe('URL de autorização', () => {
  it('leva PKCE S256, state e nonce', () => {
    const desafio = novoDesafio();
    const url = new URL(urlDeAutorizacao(CFG, desafio));

    expect(url.origin + url.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('code_challenge')).toBe(desafioDoVerifier(desafio.verifier));
    expect(url.searchParams.get('state')).toBe(desafio.state);
    expect(url.searchParams.get('nonce')).toBe(desafio.nonce);
    expect(url.searchParams.get('hd')).toBe('cotemig.com.br');
  });

  it('o verifier nunca vai na URL, só o desafio derivado', () => {
    const desafio = novoDesafio();
    expect(urlDeAutorizacao(CFG, desafio)).not.toContain(desafio.verifier);
  });

  it('cada desafio é diferente do anterior', () => {
    const a = novoDesafio();
    const b = novoDesafio();
    expect(a.state).not.toBe(b.state);
    expect(a.nonce).not.toBe(b.nonce);
    expect(a.verifier).not.toBe(b.verifier);
  });
});

describe('troca de código por identidade', () => {
  it('token válido devolve sub, email e nome', async () => {
    const r = await trocar(payloadValido());
    expect(r).toEqual({
      ok: true,
      identidade: {
        sub: '11223344',
        email: '10240099@aluno.cotemig.com.br',
        nome: 'Ana Aluna',
        hd: 'cotemig.com.br',
      },
    });
  });

  it('o code_verifier é enviado na troca', async () => {
    corpos = [];
    vi.stubGlobal('fetch', respondeComToken(payloadValido()));
    await trocarCodigoPorIdentidade(CFG, { code: 'c', verifier: 'meu-verifier', nonce: 'nonce-certo' });

    expect(corpos[0]).toContain('code_verifier=meu-verifier');
    expect(corpos[0]).toContain('grant_type=authorization_code');
  });

  it('nonce diferente é recusado (replay)', async () => {
    expect(await trocar(payloadValido({ nonce: 'outro' }))).toEqual({
      ok: false,
      motivo: 'token_invalido',
    });
  });

  it('audience de outro cliente é recusada', async () => {
    expect(await trocar(payloadValido({ aud: 'outro-cliente' }))).toEqual({
      ok: false,
      motivo: 'token_invalido',
    });
  });

  it('emissor desconhecido é recusado', async () => {
    expect(await trocar(payloadValido({ iss: 'https://malicioso.example' }))).toEqual({
      ok: false,
      motivo: 'token_invalido',
    });
  });

  it('token expirado é recusado', async () => {
    expect(await trocar(payloadValido({ exp: Math.floor(Date.now() / 1000) - 10 }))).toEqual({
      ok: false,
      motivo: 'token_invalido',
    });
  });

  it('email não verificado é recusado', async () => {
    expect(await trocar(payloadValido({ email_verified: false }))).toEqual({
      ok: false,
      motivo: 'email_nao_verificado',
    });
    expect(await trocar(payloadValido({ email_verified: 'true' }))).toEqual({
      ok: false,
      motivo: 'email_nao_verificado',
    });
  });

  it('domínio de fora do colégio é recusado mesmo com hd forjado no email', async () => {
    expect(await trocar(payloadValido({ email: 'qualquer@gmail.com', hd: null }))).toEqual({
      ok: false,
      motivo: 'dominio_recusado',
    });
  });

  it('o alias aluno.cotemig.com.br é aceito', async () => {
    const r = await trocar(payloadValido({ email: 'x@aluno.cotemig.com.br', hd: 'cotemig.com.br' }));
    expect(r.ok).toBe(true);
  });

  it('falha de rede na troca não vaza exceção', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('fetch failed');
      }),
    );
    expect(
      await trocarCodigoPorIdentidade(CFG, { code: 'c', verifier: 'v', nonce: 'n' }),
    ).toEqual({ ok: false, motivo: 'troca_falhou' });
  });

  it('resposta sem id_token é recusada', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 200 })));
    expect(
      await trocarCodigoPorIdentidade(CFG, { code: 'c', verifier: 'v', nonce: 'n' }),
    ).toEqual({ ok: false, motivo: 'troca_falhou' });
  });
});
