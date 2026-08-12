import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const DIR = join(process.cwd(), 'src/app/actions');

const GUARDAS = ['getCurrentUser', 'assertPapel', 'exigirAdmin', 'exigirLogin'];

const PUBLICAS_POR_DESIGN = new Set([
  'loginComSenhaAction',
  'logoutAction',
  'cadastrarAction',
  'cadastrarComConviteAction',
]);

const VERIFICADORES_DE_CREDENCIAL = [
  'entrarComSenha',
  'verificarSenha',
  'buscarPerfilCotemig',
  'cadastrarComConvite',
];

interface Acao {
  arquivo: string;
  nome: string;
  corpo: string;
}

function corpoDaFuncao(fonte: string, inicio: number): string {
  const proximo = fonte.indexOf('\nexport ', inicio + 1);
  return proximo < 0 ? fonte.slice(inicio) : fonte.slice(inicio, proximo);
}

function coletarAcoes(): Acao[] {
  const acoes: Acao[] = [];
  for (const arquivo of readdirSync(DIR).filter((f) => f.endsWith('.ts'))) {
    const fonte = readFileSync(join(DIR, arquivo), 'utf8');
    if (!/^\s*['"]use server['"]/m.test(fonte)) continue;

    const re = /export\s+async\s+function\s+([A-Za-z0-9_$]+)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(fonte)) !== null) {
      acoes.push({ arquivo, nome: m[1], corpo: corpoDaFuncao(fonte, m.index) });
    }
  }
  return acoes;
}

describe('Server Actions expostas', () => {
  const acoes = coletarAcoes();

  it('encontra as actions do projeto', () => {
    expect(acoes.length).toBeGreaterThan(20);
  });

  it('toda action exportada chama uma guarda antes de agir', () => {
    const semGuarda = acoes
      .filter((a) => !PUBLICAS_POR_DESIGN.has(a.nome))
      .filter((a) => !GUARDAS.some((g) => a.corpo.includes(g)))
      .map((a) => `${a.arquivo}:${a.nome}`);

    expect(semGuarda).toEqual([]);
  });

  it('nenhuma action emite sessão sem verificar credencial', () => {
    const emiteSemVerificar = acoes
      .filter((a) => a.corpo.includes('setSession'))
      .filter((a) => !VERIFICADORES_DE_CREDENCIAL.some((v) => a.corpo.includes(v)))
      .map((a) => `${a.arquivo}:${a.nome}`);

    expect(emiteSemVerificar).toEqual([]);
  });

  it('nenhuma action aceita o email como prova de identidade', () => {
    const fonteAuth = readFileSync(join(DIR, 'auth.ts'), 'utf8');
    expect(fonteAuth).not.toContain('loginComGoogleAction');
    expect(fonteAuth).not.toContain('entrarComGoogle');
  });
});
