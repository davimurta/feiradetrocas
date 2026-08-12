import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { buscarPerfilCotemig } from '@/lib/cotemig-api';

const SENHA = 'senha-super-secreta-do-portal';
const USUARIO = '10240099';

interface Chamada {
  url: string;
  init: RequestInit;
}

let chamadas: Chamada[] = [];
let saidas: string[] = [];
const consoleOriginal = { ...console };

function perfil(extra: Record<string, unknown> = {}) {
  return {
    usuario: USUARIO,
    nome: 'Ana Aluna',
    emailInstitucional: `${USUARIO}@aluno.cotemig.com.br`,
    email: 'ana@gmail.com',
    permissoes: { perfil: true },
    ...extra,
  };
}

function responder(status: number, corpo: unknown) {
  return vi.fn(async (url: string | URL | Request, init: RequestInit = {}) => {
    chamadas.push({ url: String(url), init });
    return new Response(JSON.stringify(corpo), {
      status,
      headers: { 'content-type': 'application/json' },
    });
  });
}

beforeEach(() => {
  chamadas = [];
  saidas = [];
  process.env.COTEMIG_TIMEOUT_MS = '1000';
  for (const nivel of ['log', 'info', 'warn', 'error', 'debug'] as const) {
    console[nivel] = (...args: unknown[]) => {
      saidas.push(args.map(String).join(' '));
    };
  }
});

afterEach(() => {
  Object.assign(console, consoleOriginal);
  vi.unstubAllGlobals();
  delete process.env.COTEMIG_TIMEOUT_MS;
});

describe('cotemig-api', () => {
  it('200 devolve o perfil normalizado', async () => {
    vi.stubGlobal('fetch', responder(200, perfil()));

    const r = await buscarPerfilCotemig(USUARIO, SENHA);

    expect(r).toEqual({
      ok: true,
      perfil: {
        usuario: USUARIO,
        nome: 'Ana Aluna',
        emailInstitucional: `${USUARIO}@aluno.cotemig.com.br`,
        email: 'ana@gmail.com',
      },
    });
  });

  it('só emite GET, para a URL do perfil, com Basic Auth', async () => {
    vi.stubGlobal('fetch', responder(200, perfil()));
    await buscarPerfilCotemig(USUARIO, SENHA);

    expect(chamadas).toHaveLength(1);
    expect(chamadas[0].url).toBe('https://api.cotemig.com.br/v1/perfil');
    expect(chamadas[0].init.method).toBe('GET');

    const auth = (chamadas[0].init.headers as Record<string, string>).Authorization;
    expect(auth.startsWith('Basic ')).toBe(true);
    expect(Buffer.from(auth.slice(6), 'base64').toString()).toBe(`${USUARIO}:${SENHA}`);
  });

  it('nenhum caminho de código emite método diferente de GET', async () => {
    const cenarios: [number, unknown][] = [
      [200, perfil()],
      [401, { erro: 401, detalhes: 'x' }],
      [403, { erro: 403 }],
      [500, { erro: 500 }],
      [302, {}],
    ];

    for (const [status, corpo] of cenarios) {
      vi.stubGlobal('fetch', responder(status, corpo));
      await buscarPerfilCotemig(USUARIO, SENHA);
    }

    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string | URL | Request, init: RequestInit = {}) => {
        chamadas.push({ url: String(url), init });
        throw new TypeError('fetch failed');
      }),
    );
    await buscarPerfilCotemig(USUARIO, SENHA);

    expect(chamadas.length).toBeGreaterThan(0);
    for (const c of chamadas) {
      expect(c.init.method).toBe('GET');
      expect(c.url.startsWith('https://api.cotemig.com.br/v1/')).toBe(true);
      expect(c.url).not.toContain('atualizarSenha');
      expect(c.url).not.toContain(SENHA);
    }
  });

  it('401 e 403 devolvem motivo de credencial, sem retry', async () => {
    for (const status of [401, 403]) {
      chamadas = [];
      vi.stubGlobal('fetch', responder(status, { erro: status, codigo: 103, detalhes: 'x' }));
      const r = await buscarPerfilCotemig(USUARIO, SENHA);
      expect(r).toEqual({ ok: false, motivo: 'credencial' });
      expect(chamadas).toHaveLength(1);
    }
  });

  it('5xx tenta de novo uma vez e depois devolve indisponivel', async () => {
    vi.stubGlobal('fetch', responder(503, { erro: 503 }));
    const r = await buscarPerfilCotemig(USUARIO, SENHA);
    expect(r).toEqual({ ok: false, motivo: 'indisponivel' });
    expect(chamadas).toHaveLength(2);
  });

  it('timeout aborta e devolve indisponivel', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string | URL | Request, init: RequestInit = {}) => {
        chamadas.push({ url: String(url), init });
        return new Promise<Response>((_, reject) => {
          init.signal?.addEventListener('abort', () => reject(new Error('The operation was aborted')));
        });
      }),
    );

    const r = await buscarPerfilCotemig(USUARIO, SENHA);
    expect(r).toEqual({ ok: false, motivo: 'indisponivel' });
    expect(chamadas).toHaveLength(2);
  });

  it('resposta 200 sem o campo usuario é recusada', async () => {
    vi.stubGlobal('fetch', responder(200, { nome: 'Sem usuario' }));
    expect(await buscarPerfilCotemig(USUARIO, SENHA)).toEqual({
      ok: false,
      motivo: 'resposta_invalida',
    });
  });

  it('a senha não aparece em nenhuma saída de console, nem no caminho de erro', async () => {
    const cenarios = [
      responder(200, perfil()),
      responder(401, { erro: 401 }),
      responder(500, { erro: 500 }),
      vi.fn(async () => {
        throw new TypeError(`fetch failed para usuario=${USUARIO}`);
      }),
    ];

    for (const f of cenarios) {
      vi.stubGlobal('fetch', f);
      await buscarPerfilCotemig(USUARIO, SENHA);
    }

    expect(saidas.join('\n')).not.toContain(SENHA);
  });

  it('a senha não aparece em nenhum resultado devolvido ao chamador', async () => {
    const resultados: unknown[] = [];

    for (const f of [responder(200, perfil()), responder(401, { erro: 401 }), responder(500, {})]) {
      vi.stubGlobal('fetch', f);
      resultados.push(await buscarPerfilCotemig(USUARIO, SENHA));
    }

    expect(JSON.stringify(resultados)).not.toContain(SENHA);
  });

  it('credencial vazia nem chega a sair para a rede', async () => {
    const f = responder(200, perfil());
    vi.stubGlobal('fetch', f);

    expect(await buscarPerfilCotemig('', SENHA)).toEqual({ ok: false, motivo: 'credencial' });
    expect(await buscarPerfilCotemig(USUARIO, '')).toEqual({ ok: false, motivo: 'credencial' });
    expect(f).not.toHaveBeenCalled();
  });
});
