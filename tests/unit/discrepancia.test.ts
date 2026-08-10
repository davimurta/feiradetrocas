import { describe, it, expect } from 'vitest';
import {
  avaliarItem,
  detectarAlertas,
  mediana,
  mad,
  CONFIG_DISCREPANCIA,
  type ItemAvaliavel,
} from '@/lib/alertas/discrepancia';

// Grupo homogêneo de "Livros" em ~10 fichas (amostra suficiente).
const livros: ItemAvaliavel[] = [
  { categoria: 'Livros', valor: 10 },
  { categoria: 'Livros', valor: 11 },
  { categoria: 'Livros', valor: 9 },
  { categoria: 'Livros', valor: 10 },
  { categoria: 'Livros', valor: 12 },
  { categoria: 'Livros', valor: 8 },
];

describe('mediana / mad', () => {
  it('mediana lida com tamanho par e ímpar', () => {
    expect(mediana([3, 1, 2])).toBe(2);
    expect(mediana([1, 2, 3, 4])).toBe(2.5);
    expect(mediana([])).toBe(0);
  });

  it('mad é a mediana das distâncias absolutas à mediana', () => {
    expect(mad([10, 10, 10, 10])).toBe(0);
    expect(mad([1, 1, 2, 2, 4, 8])).toBeGreaterThan(0);
  });
});

describe('avaliarItem', () => {
  it('preço zero: sinaliza preco_zero e nada mais', () => {
    expect(avaliarItem(0, 'Livros', livros)).toEqual(['preco_zero']);
    expect(avaliarItem(-5, 'Livros', livros)).toEqual(['preco_zero']);
  });

  it('item claramente discrepante na categoria é sinalizado', () => {
    const referencia = [...livros, { categoria: 'Livros', valor: 200 }];
    expect(avaliarItem(200, 'Livros', referencia)).toEqual(['preco_discrepante']);
  });

  it('grupo homogêneo: preço dentro do padrão não gera alerta', () => {
    const referencia = [...livros, { categoria: 'Livros', valor: 10 }];
    expect(avaliarItem(10, 'Livros', referencia)).toEqual([]);
    expect(avaliarItem(11, 'Livros', referencia)).toEqual([]);
  });

  it('grupo pequeno: cai no fallback de múltiplo contra a mediana geral da feira', () => {
    // Só 2 "Eletrônicos", abaixo da amostra mínima. A feira toda gira em ~10 fichas.
    const referencia: ItemAvaliavel[] = [
      ...livros,
      { categoria: 'Eletrônicos', valor: 12 },
      { categoria: 'Eletrônicos', valor: 300 },
    ];
    // 300 é > 5x a mediana geral (~10) -> discrepante mesmo com grupo pequeno.
    expect(avaliarItem(300, 'Eletrônicos', referencia)).toEqual(['preco_discrepante']);
    // 12 fica dentro do intervalo -> sem alerta.
    expect(avaliarItem(12, 'Eletrônicos', referencia)).toEqual([]);
  });

  it('grupo homogêneo com MAD 0: usa o múltiplo, não sinaliza pequenas diferenças', () => {
    const iguais: ItemAvaliavel[] = Array.from({ length: 6 }, () => ({ categoria: 'Jogos', valor: 20 }));
    expect(avaliarItem(21, 'Jogos', iguais)).toEqual([]); // 21 não é 5x maior que 20
    expect(avaliarItem(500, 'Jogos', iguais)).toEqual(['preco_discrepante']);
  });

  it('respeita config customizada (k menor deixa mais sensível)', () => {
    // 14 fichas fica logo acima do padrão (~10): fora do alcance com k=3, dentro com k=1.
    const semAlerta = avaliarItem(14, 'Livros', livros);
    const comAlerta = avaliarItem(14, 'Livros', livros, { ...CONFIG_DISCREPANCIA, k: 1 });
    expect(semAlerta).toEqual([]);
    expect(comAlerta).toEqual(['preco_discrepante']);
  });
});

describe('detectarAlertas', () => {
  it('devolve só os itens com algum motivo', () => {
    const itens = [
      { id: 'ok', categoria: 'Livros', valor: 10 },
      { id: 'zero', categoria: 'Livros', valor: 0 },
      { id: 'caro', categoria: 'Livros', valor: 500 },
    ];
    const referencia = [...livros, ...itens];
    const alertas = detectarAlertas(itens, referencia);
    expect(alertas.map((a) => a.id).sort()).toEqual(['caro', 'zero']);
    expect(alertas.find((a) => a.id === 'zero')?.motivos).toEqual(['preco_zero']);
    expect(alertas.find((a) => a.id === 'caro')?.motivos).toEqual(['preco_discrepante']);
  });
});
