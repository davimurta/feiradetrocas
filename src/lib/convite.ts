export const ALFABETO_CODIGO = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export const TAMANHO_CODIGO = 8;

export function formatarCodigo(codigo: string): string {
  const limpo = normalizarCodigo(codigo);
  return limpo.length === TAMANHO_CODIGO ? `${limpo.slice(0, 4)}-${limpo.slice(4)}` : limpo;
}

export function normalizarCodigo(codigo: string): string {
  return codigo.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export function codigoPlausivel(codigo: string): boolean {
  const limpo = normalizarCodigo(codigo);
  return limpo.length === TAMANHO_CODIGO && [...limpo].every((c) => ALFABETO_CODIGO.includes(c));
}
