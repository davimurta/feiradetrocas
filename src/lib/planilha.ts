// Serialização de tabelas para planilha. Puro: recebe `Tabela`, devolve texto ou buffer.
// Fica separado de `server/export.ts` (que faz as consultas) para poder ser testado sem
// banco e para deixar explícito que nada aqui conhece Prisma.

import ExcelJS from 'exceljs';

export interface Coluna {
  chave: string;
  titulo: string;
  largura: number;
}

export interface Tabela {
  nome: string;
  colunas: Coluna[];
  linhas: Record<string, string | number>[];
}

/** Escape CSV: aspas duplicadas, e campo entre aspas quando tem separador ou quebra. */
function celulaCsv(v: string | number): string {
  const s = String(v ?? '');
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * CSV com `;` e BOM: é o que o Excel em pt-BR abre direto. Com `,` ele joga a linha
 * inteira numa coluna só, e sem BOM os acentos saem quebrados.
 */
export function paraCsv(tabela: Tabela): string {
  const cabecalho = tabela.colunas.map((c) => celulaCsv(c.titulo)).join(';');
  const corpo = tabela.linhas.map((l) =>
    tabela.colunas.map((c) => celulaCsv(l[c.chave] ?? '')).join(';'),
  );
  return `﻿${[cabecalho, ...corpo].join('\r\n')}\r\n`;
}

/** Uma aba por tabela, com cabeçalho congelado e filtro automático. */
export async function paraXlsx(tabelas: Tabela[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Feira de Trocas';
  wb.created = new Date();

  for (const t of tabelas) {
    const aba = wb.addWorksheet(t.nome, { views: [{ state: 'frozen', ySplit: 1 }] });
    aba.columns = t.colunas.map((c) => ({ header: c.titulo, key: c.chave, width: c.largura }));
    aba.addRows(t.linhas);
    aba.getRow(1).font = { bold: true };
    aba.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: t.colunas.length } };
  }

  return Buffer.from(await wb.xlsx.writeBuffer());
}
