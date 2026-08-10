export const FRASE_CONFIRMACAO = 'CONFIRMAR';

export function confirmacaoValida(texto: string): boolean {
  return texto.trim().toUpperCase() === FRASE_CONFIRMACAO;
}
