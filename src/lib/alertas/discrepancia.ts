export type MotivoAlerta = 'preco_zero' | 'preco_discrepante';

export interface ItemAvaliavel {
  valor: number;
  categoria: string;
}

export interface ItemComId extends ItemAvaliavel {
  id: string;
}

export interface ConfigDiscrepancia {
  k: number;
  escalaMad: number;
  amostraMinima: number;
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

export function mad(nums: number[]): number {
  if (nums.length === 0) return 0;
  const med = mediana(nums);
  return mediana(nums.map((v) => Math.abs(v - med)));
}

function foraDoIntervalo(valor: number, base: number, mult: number): boolean {
  if (base <= 0) return false;
  return valor > base * mult || valor < base / mult;
}

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
        :
          foraDoIntervalo(valor, med, cfg.multiplo);
  } else {
    const medFeira = mediana(referencia.map((r) => r.valor));
    discrepante = foraDoIntervalo(valor, medFeira, cfg.multiplo);
  }

  return discrepante ? ['preco_discrepante'] : [];
}

export function detectarAlertas(
  itens: ItemComId[],
  referencia: ItemAvaliavel[],
  cfg: ConfigDiscrepancia = CONFIG_DISCREPANCIA,
): { id: string; motivos: MotivoAlerta[] }[] {
  return itens
    .map((it) => ({ id: it.id, motivos: avaliarItem(it.valor, it.categoria, referencia, cfg) }))
    .filter((r) => r.motivos.length > 0);
}
