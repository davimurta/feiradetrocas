import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';

const RAIZ = join(process.cwd(), 'src');

function arquivos(dir: string): string[] {
  return readdirSync(dir).flatMap((nome) => {
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) return arquivos(caminho);
    return /\.tsx?$/.test(nome) ? [caminho] : [];
  });
}

function ehCliente(fonte: string): boolean {
  return /^\s*['"]use client['"]/m.test(fonte);
}

function ehServidor(fonte: string): boolean {
  return /^\s*['"]use server['"]/m.test(fonte) || /['"]server-only['"]/.test(fonte);
}

function importados(fonte: string): string[] {
  const encontrados: string[] = [];
  const re =
    /(?:^|\n)\s*import\s+(?!type\s)[^;]*?from\s*['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(fonte)) !== null) encontrados.push(m[1] ?? m[2]);
  return encontrados;
}

function resolver(especificador: string, deArquivo: string): string | null {
  const base = especificador.startsWith('@/')
    ? join(RAIZ, especificador.slice(2))
    : especificador.startsWith('.')
      ? resolve(dirname(deArquivo), especificador)
      : null;
  if (!base) return null;

  for (const tentativa of [`${base}.ts`, `${base}.tsx`, join(base, 'index.ts'), join(base, 'index.tsx')]) {
    if (existsSync(tentativa) && statSync(tentativa).isFile()) return tentativa;
  }
  return null;
}

function usaNode(fonte: string): boolean {
  return importados(fonte).some((i) => i.startsWith('node:'));
}

function rastrear(entrada: string): string[] | null {
  const visitados = new Set<string>();
  const pilha: { arquivo: string; caminho: string[] }[] = [{ arquivo: entrada, caminho: [entrada] }];

  while (pilha.length > 0) {
    const atual = pilha.pop()!;
    if (visitados.has(atual.arquivo)) continue;
    visitados.add(atual.arquivo);

    const fonte = readFileSync(atual.arquivo, 'utf8');

    if (atual.arquivo !== entrada && ehServidor(fonte)) continue;
    if (usaNode(fonte)) return atual.caminho;

    for (const especificador of importados(fonte)) {
      const alvo = resolver(especificador, atual.arquivo);
      if (alvo) pilha.push({ arquivo: alvo, caminho: [...atual.caminho, alvo] });
    }
  }

  return null;
}

function relativo(caminho: string): string {
  return caminho.replace(`${process.cwd()}/`, '');
}

describe('fronteira cliente e servidor', () => {
  const todos = arquivos(RAIZ);

  it('encontra os componentes de cliente do projeto', () => {
    const clientes = todos.filter((f) => ehCliente(readFileSync(f, 'utf8')));
    expect(clientes.length).toBeGreaterThan(5);
  });

  it('nenhum componente de cliente arrasta um módulo node: para o bundle', () => {
    const clientes = todos.filter((f) => ehCliente(readFileSync(f, 'utf8')));

    const infratores = clientes
      .map((f) => ({ arquivo: f, rastro: rastrear(f) }))
      .filter((r) => r.rastro !== null)
      .map((r) => r.rastro!.map(relativo).join(' -> '));

    expect(infratores).toEqual([]);
  });

  it('a instrumentação não depende de node:, porque roda também no runtime edge', () => {
    const instrumentacao = join(RAIZ, 'instrumentation.ts');
    if (!existsSync(instrumentacao)) return;

    const rastro = rastrear(instrumentacao);
    expect(rastro === null ? null : rastro.map(relativo).join(' -> ')).toBeNull();
  });
});
