import { randomInt } from 'node:crypto';
import { ALFABETO_CODIGO, TAMANHO_CODIGO, formatarCodigo } from './convite';

export function gerarCodigo(): string {
  let bruto = '';
  for (let i = 0; i < TAMANHO_CODIGO; i++) bruto += ALFABETO_CODIGO[randomInt(ALFABETO_CODIGO.length)];
  return formatarCodigo(bruto);
}

const DIGITOS = '0123456789';

export function gerarCodigoCarteira(): string {
  let n = '';
  for (let i = 0; i < 6; i++) n += DIGITOS[randomInt(DIGITOS.length)];
  return `v${n}`;
}
