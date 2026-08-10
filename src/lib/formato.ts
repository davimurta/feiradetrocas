export function formatarDataHora(d: Date | string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(d));
}

/**
 * "há 4 min", "há 2 h", "ontem"… Na recepção o que importa é o quão velho é o item na
 * fila, não a hora exata, a hora exata continua no `title` de quem mostra.
 */
export function tempoRelativo(d: Date | string, agora: Date = new Date()): string {
  const segundos = Math.floor((agora.getTime() - new Date(d).getTime()) / 1000);
  if (segundos < 60) return 'agora';
  if (segundos < 3600) return `há ${Math.floor(segundos / 60)} min`;
  if (segundos < 86_400) return `há ${Math.floor(segundos / 3600)} h`;
  const dias = Math.floor(segundos / 86_400);
  return dias === 1 ? 'ontem' : `há ${dias} dias`;
}

export const ROTULO_TRANSACAO: Record<string, string> = {
  credito_entrada: 'Item entregue',
  debito_compra: 'Compra',
  ajuste_manual: 'Ajuste',
};

export function sinalTransacao(tipo: string, valor: number): { debito: boolean; magnitude: number } {
  const debito = tipo === 'debito_compra' || (tipo === 'ajuste_manual' && valor < 0);
  return { debito, magnitude: Math.abs(valor) };
}
