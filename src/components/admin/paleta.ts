export const CATEGORICA = ['#2f7d0b', '#3a5fa8', '#c2680f', '#7a4bb5'] as const;

export const SEQUENCIAL = ['#77b64f', '#3d8f16', '#173d06'] as const;

export const ESTADO = {
  bom: '#2f7d0b',
  atencao: '#9a5b0b',
  critico: '#b42318',
  neutro: '#68705c',
} as const;

export const GRID = '#dfd9c6';
export const EIXO = '#68705c';
export const TINTA = '#20261a';
export const SUPERFICIE = '#ffffff';

export const COR_STATUS: Record<string, string> = {
  aprovado: ESTADO.bom,
  pendente: ESTADO.atencao,
  recusado: ESTADO.critico,
  cancelado: ESTADO.neutro,
};

export const numero = new Intl.NumberFormat('pt-BR');

export function duracao(segundos: number | null): string {
  if (segundos === null) return '—';
  if (segundos < 90) return `${Math.round(segundos)} s`;
  if (segundos < 5400) return `${Math.round(segundos / 60)} min`;
  return `${(segundos / 3600).toFixed(1)} h`;
}

export function rotuloBalde(balde: string, granularidade: 'hora' | 'dia'): string {
  const [data, hora] = balde.split(' ');
  const [, mes, dia] = data.split('-');
  return granularidade === 'hora' ? `${hora.slice(0, 2)}h` : `${dia}/${mes}`;
}

export function rotuloBaldeCompleto(balde: string, granularidade: 'hora' | 'dia'): string {
  const [data, hora] = balde.split(' ');
  const [, mes, dia] = data.split('-');
  return granularidade === 'hora' ? `${dia}/${mes} às ${hora}` : `${dia}/${mes}`;
}
