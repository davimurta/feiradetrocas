// Análise de discrepância de preço dos itens — puramente informativa.
//
// Gera alertas NÃO-bloqueantes (nunca impede o cadastro nem o push para produção):
//  - `preco_zero`: item com valor <= 0.
//  - `preco_discrepante`: valor destoa muito dos demais itens da MESMA categoria.
//
// A comparação usa mediana + MAD (Median Absolute Deviation), robustos a outliers e a
// grupos pequenos — poucos itens ou um preço absurdo não distorcem o próprio "normal".
// Grupos pequenos demais (ou homogêneos, MAD = 0) caem num teto/piso contra a mediana
// geral da feira. Todos os limiares ficam em CONFIG_DISCREPANCIA para ajuste fácil.

export type MotivoAlerta = 'preco_zero' | 'preco_discrepante';

export interface ItemAvaliavel {
  valor: number;
  categoria: string;
}

export interface ItemComId extends ItemAvaliavel {
  id: string;
}

export interface ConfigDiscrepancia {
  /** Nº de MADs (escalados) de distância da mediana que caracteriza discrepância. */
  k: number;
  /** Fator que escala o MAD para aproximar o desvio-padrão sob normalidade. */
  escalaMad: number;
  /** Mínimo de itens na categoria para confiar na estatística (mediana/MAD). */
  amostraMinima: number;
  /** Fallback (grupo pequeno ou homogêneo): fora de [mediana/mult, mediana*mult]. */
  multiplo: number;
}

export const CONFIG_DISCREPANCIA: ConfigDiscrepancia = {
  k: 3,
  escalaMad: 1.4826,
  amostraMinima: 4,
  multiplo: 5,
};

export function mediana(nums: number[]): number {
  if (nums.length === 0) return 0;
  const ordenado = [...nums].sort((a, b) => a - b);
  const meio = Math.floor(ordenado.length / 2);
  return ordenado.length % 2 ? ordenado[meio] : (ordenado[meio - 1] + ordenado[meio]) / 2;
}

/** Median Absolute Deviation: mediana das distâncias absolutas à mediana. */
export function mad(nums: number[]): number {
  if (nums.length === 0) return 0;
  const med = mediana(nums);
  return mediana(nums.map((v) => Math.abs(v - med)));
}

/** Fora do intervalo [base/mult, base*mult] — usado quando a estatística não se aplica. */
function foraDoIntervalo(valor: number, base: number, mult: number): boolean {
  if (base <= 0) return false;
  return valor > base * mult || valor < base / mult;
}

/** Motivos de alerta para um único item, dado o universo de referência. */
export function avaliarItem(
  valor: number,
  categoria: string,
  referencia: ItemAvaliavel[],
  cfg: ConfigDiscrepancia = CONFIG_DISCREPANCIA,
): MotivoAlerta[] {
  if (valor <= 0) return ['preco_zero'];

  const grupo = referencia.filter((r) => r.categoria === categoria).map((r) => r.valor);

  let discrepante: boolean;
  if (grupo.length >= cfg.amostraMinima) {
    const med = mediana(grupo);
    const madv = mad(grupo);
    discrepante =
      madv > 0
        ? Math.abs(valor - med) > cfg.k * cfg.escalaMad * madv
        : // Grupo homogêneo (MAD = 0): estatística não separa nada, usa o múltiplo.
          foraDoIntervalo(valor, med, cfg.multiplo);
  } else {
    // Amostra pequena demais para a estatística: compara com a mediana geral da feira.
    const medFeira = mediana(referencia.map((r) => r.valor));
    discrepante = foraDoIntervalo(valor, medFeira, cfg.multiplo);
  }

  return discrepante ? ['preco_discrepante'] : [];
}

/** Avalia uma lista de itens e devolve só os que têm ao menos um alerta. */
export function detectarAlertas(
  itens: ItemComId[],
  referencia: ItemAvaliavel[],
  cfg: ConfigDiscrepancia = CONFIG_DISCREPANCIA,
): { id: string; motivos: MotivoAlerta[] }[] {
  return itens
    .map((it) => ({ id: it.id, motivos: avaliarItem(it.valor, it.categoria, referencia, cfg) }))
    .filter((r) => r.motivos.length > 0);
}
