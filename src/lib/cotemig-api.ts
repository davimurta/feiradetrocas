const BASE = 'https://api.cotemig.com.br/v1';

const CAMINHO_PERFIL = '/perfil';

const METODO = 'GET' as const;

const TIMEOUT_PADRAO_MS = 5000;

export interface PerfilCotemig {
  usuario: string;
  nome: string;
  emailInstitucional: string | null;
  email: string | null;
}

export type ResultadoPerfil =
  | { ok: true; perfil: PerfilCotemig }
  | { ok: false; motivo: 'credencial' | 'indisponivel' | 'resposta_invalida' };

function timeoutMs(): number {
  const n = Number(process.env.COTEMIG_TIMEOUT_MS);
  return Number.isInteger(n) && n >= 1000 && n <= 15000 ? n : TIMEOUT_PADRAO_MS;
}

function texto(valor: unknown): string | null {
  return typeof valor === 'string' && valor.trim() !== '' ? valor.trim() : null;
}

function interpretar(bruto: unknown): PerfilCotemig | null {
  if (!bruto || typeof bruto !== 'object' || Array.isArray(bruto)) return null;

  const dados = bruto as Record<string, unknown>;
  const usuario = texto(dados.usuario);
  if (!usuario) return null;

  return {
    usuario,
    nome: texto(dados.nome) ?? usuario,
    emailInstitucional: texto(dados.emailInstitucional),
    email: texto(dados.email),
  };
}

async function buscar(caminho: string, usuario: string, senha: string): Promise<Response> {
  const url = `${BASE}${caminho}`;
  const autorizacao = `Basic ${Buffer.from(`${usuario}:${senha}`).toString('base64')}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs());

  try {
    return await fetch(url, {
      method: METODO,
      headers: { Authorization: autorizacao, Accept: 'application/json' },
      signal: controller.signal,
      redirect: 'manual',
      cache: 'no-store',
    });
  } finally {
    clearTimeout(timer);
  }
}

export async function buscarPerfilCotemig(
  usuario: string,
  senha: string,
): Promise<ResultadoPerfil> {
  const login = usuario.trim();
  if (!login || !senha) return { ok: false, motivo: 'credencial' };

  for (let tentativa = 0; tentativa < 2; tentativa++) {
    let resposta: Response;

    try {
      resposta = await buscar(CAMINHO_PERFIL, login, senha);
    } catch {
      if (tentativa === 0) {
        await new Promise((r) => setTimeout(r, 300));
        continue;
      }
      return { ok: false, motivo: 'indisponivel' };
    }

    if (resposta.status === 401 || resposta.status === 403) {
      return { ok: false, motivo: 'credencial' };
    }

    if (resposta.status !== 200) {
      if (tentativa === 0 && resposta.status >= 500) {
        await new Promise((r) => setTimeout(r, 300));
        continue;
      }
      return { ok: false, motivo: 'indisponivel' };
    }

    let bruto: unknown;
    try {
      bruto = await resposta.json();
    } catch {
      return { ok: false, motivo: 'resposta_invalida' };
    }

    const perfil = interpretar(bruto);
    return perfil ? { ok: true, perfil } : { ok: false, motivo: 'resposta_invalida' };
  }

  return { ok: false, motivo: 'indisponivel' };
}
