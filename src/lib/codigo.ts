import { randomInt } from 'node:crypto';

const ALFABETO = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const TAMANHO_PADRAO = 8;

function bloco(tamanho: number): string {
  let out = '';
  for (let i = 0; i < tamanho; i++) {
    out += ALFABETO[randomInt(ALFABETO.length)];
  }
  return out;
}

export function gerarCodigoEtiqueta(): string {
  return `ITM-${bloco(TAMANHO_PADRAO)}`;
}

export function gerarCodigoCarteira(): string {
  return `CAR-${bloco(TAMANHO_PADRAO)}`;
}
