// Filtro do painel de métricas, um único parser compartilhado pela Server Action e
// pelo Route Handler de exportação, para que gráfico e planilha nunca divirjam de
// período. Aceita ISO completo ou `datetime-local`/`YYYY-MM-DD` (o que o <input> manda).

import { z } from 'zod';
import { Unidade } from '@prisma/client';

export const PERIODOS = ['hoje', '24h', '7d', '30d', 'tudo', 'custom'] as const;
export type Periodo = (typeof PERIODOS)[number];

export type Granularidade = 'hora' | 'dia';

export interface FiltroMetricas {
  de: Date;
  ate: Date;
  unidade?: Unidade;
  /** Ausente = escolhida pelo tamanho da janela (ver `resolverGranularidade`). */
  granularidade?: Granularidade;
}

/**
 * Balde da série temporal. Até 3 dias a feira é lida hora a hora (é a escala de um
 * evento de um dia); acima disso, por dia, senão o eixo vira serragem.
 */
export function resolverGranularidade(de: Date, ate: Date, pedida?: Granularidade): Granularidade {
  if (pedida) return pedida;
  const horas = (ate.getTime() - de.getTime()) / 3_600_000;
  return horas <= 72 ? 'hora' : 'dia';
}

const DIA = 24 * 3_600_000;

export const filtroMetricasSchema = z.object({
  periodo: z.enum(PERIODOS).optional(),
  de: z.string().min(1).optional(),
  ate: z.string().min(1).optional(),
  unidade: z.nativeEnum(Unidade).optional(),
  granularidade: z.enum(['hora', 'dia']).optional(),
});

export type FiltroMetricasInput = z.infer<typeof filtroMetricasSchema>;

function paraData(valor: string | undefined, fallback: Date): Date {
  if (!valor) return fallback;
  // 'YYYY-MM-DD' sozinho vira meia-noite local, não UTC (senão o dia "escorrega").
  const texto = /^\d{4}-\d{2}-\d{2}$/.test(valor) ? `${valor}T00:00:00` : valor;
  const d = new Date(texto);
  return Number.isNaN(d.getTime()) ? fallback : d;
}

/** Traduz o input do painel em uma janela concreta. Padrão: últimos 7 dias. */
export function resolverFiltro(input: FiltroMetricasInput = {}): FiltroMetricas {
  const agora = new Date();
  let de: Date;
  let ate = agora;

  switch (input.periodo) {
    case 'hoje': {
      const inicio = new Date(agora);
      inicio.setHours(0, 0, 0, 0);
      de = inicio;
      break;
    }
    case '24h':
      de = new Date(agora.getTime() - DIA);
      break;
    case '30d':
      de = new Date(agora.getTime() - 30 * DIA);
      break;
    case 'tudo':
      de = new Date(0);
      break;
    case 'custom':
      de = paraData(input.de, new Date(agora.getTime() - 7 * DIA));
      ate = paraData(input.ate, agora);
      break;
    case '7d':
    default:
      de = new Date(agora.getTime() - 7 * DIA);
      break;
  }

  if (de.getTime() > ate.getTime()) [de, ate] = [ate, de];

  return { de, ate, unidade: input.unidade, granularidade: input.granularidade };
}

/** Mesmo filtro, vindo da query string do export. */
export function filtroDaQuery(params: URLSearchParams): FiltroMetricas {
  return resolverFiltro(
    filtroMetricasSchema.parse({
      periodo: params.get('periodo') ?? undefined,
      de: params.get('de') ?? undefined,
      ate: params.get('ate') ?? undefined,
      unidade: params.get('unidade') ?? undefined,
      granularidade: params.get('granularidade') ?? undefined,
    }),
  );
}
