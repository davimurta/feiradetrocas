const SEGREDOS_PROIBIDOS = new Set([
  'dev-inseguro-troque-em-producao',
  'troque-por-um-valor-aleatorio',
  'changeme',
  'secret',
]);

export const SEGREDO_DEV = 'dev-inseguro-troque-em-producao';

export function validarSegredo(valor: string | undefined): string | null {
  if (!valor) return 'SESSION_SECRET não definido.';
  if (SEGREDOS_PROIBIDOS.has(valor.trim())) return 'SESSION_SECRET está com um valor de exemplo.';
  if (valor.trim().length < 32) return 'SESSION_SECRET precisa de ao menos 32 caracteres.';
  return null;
}
