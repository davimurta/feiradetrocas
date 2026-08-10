// Higiene de texto vindo de inputs. Defesa em profundidade, a proteção real contra SQL
// injection é o Prisma (queries parametrizadas); aqui limpamos ruído perigoso e limitamos
// tamanho antes de chegar ao servidor/estado. As classes de regex são montadas por código
// (via code points) para o arquivo-fonte ficar 100% ASCII.

function classeDeFaixas(faixas: Array<[number, number]>): RegExp {
  const corpo = faixas.map(([a, b]) => String.fromCharCode(a) + '-' + String.fromCharCode(b)).join('');
  return new RegExp('[' + corpo + ']', 'g');
}
function classeDePontos(pontos: number[]): RegExp {
  return new RegExp('[' + pontos.map((p) => String.fromCharCode(p)).join('') + ']', 'g');
}

// Todos os caracteres de controle (inclui \t e \n).
const CONTROLES_INLINE = classeDeFaixas([
  [0x00, 0x1f],
  [0x7f, 0x7f],
]);
// Controles preservando \t (0x09) e \n (0x0a).
const CONTROLES_MULTILINHA = classeDeFaixas([
  [0x00, 0x08],
  [0x0b, 0x1f],
  [0x7f, 0x7f],
]);
// Zero-width, joiners, overrides de direção (bidi) e BOM, usados para spoofing/ofuscação.
const INVISIVEIS = classeDePontos([
  0x200b, 0x200c, 0x200d, 0x200e, 0x200f, 0x202a, 0x202b, 0x202c, 0x202d, 0x202e, 0x2060, 0xfeff,
]);

export const LIMITE_TEXTO = 200;
export const LIMITE_TEXTO_LONGO = 500;

/**
 * Normaliza (NFC), remove caracteres de controle e invisíveis e corta no tamanho máximo.
 * `multiline` preserva quebras de linha e tabs.
 */
export function sanitizeText(raw: string, opts?: { maxLength?: number; multiline?: boolean }): string {
  const maxLength = opts?.maxLength ?? LIMITE_TEXTO;
  let v = raw.normalize('NFC');
  if (opts?.multiline) v = v.replace(/\r\n?/g, '\n');
  v = v.replace(opts?.multiline ? CONTROLES_MULTILINHA : CONTROLES_INLINE, '');
  v = v.replace(INVISIVEIS, '');
  if (v.length > maxLength) v = v.slice(0, maxLength);
  return v;
}
