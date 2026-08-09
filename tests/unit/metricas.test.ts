import { describe, it, expect } from 'vitest';
import { resolverFiltro, resolverGranularidade } from '@/lib/filtroMetricas';
import { paraCsv, type Tabela } from '@/lib/planilha';

const HORA = 3_600_000;

describe('resolverFiltro', () => {
  it('sem período, cai nos últimos 7 dias', () => {
    const f = resolverFiltro();
    const dias = (f.ate.getTime() - f.de.getTime()) / (24 * HORA);
    expect(dias).toBeCloseTo(7, 1);
    expect(f.unidade).toBeUndefined();
  });

  it('"hoje" começa à meia-noite local', () => {
    const f = resolverFiltro({ periodo: 'hoje' });
    expect(f.de.getHours()).toBe(0);
    expect(f.de.getMinutes()).toBe(0);
    expect(f.de.toDateString()).toBe(new Date().toDateString());
  });

  it('"tudo" abre a janela desde a época', () => {
    expect(resolverFiltro({ periodo: 'tudo' }).de.getTime()).toBe(0);
  });

  it('intervalo personalizado aceita data pura e datetime-local', () => {
    const f = resolverFiltro({ periodo: 'custom', de: '2026-08-01', ate: '2026-08-02T18:30' });
    expect(f.de.getHours()).toBe(0); // meia-noite LOCAL, não UTC — o dia não escorrega
    expect(f.de.getDate()).toBe(1);
    expect(f.ate.getHours()).toBe(18);
  });

  it('inverte a janela quando o usuário digita as datas trocadas', () => {
    const f = resolverFiltro({ periodo: 'custom', de: '2026-08-10', ate: '2026-08-01' });
    expect(f.de.getTime()).toBeLessThan(f.ate.getTime());
    expect(f.de.getDate()).toBe(1);
  });

  it('repassa unidade e granularidade explícitas', () => {
    const f = resolverFiltro({ periodo: '24h', unidade: 'floresta', granularidade: 'dia' });
    expect(f.unidade).toBe('floresta');
    expect(f.granularidade).toBe('dia');
  });
});

describe('resolverGranularidade', () => {
  const base = new Date('2026-08-01T00:00:00');
  const mais = (h: number) => new Date(base.getTime() + h * HORA);

  it('janela curta (<= 72h) vira balde de hora', () => {
    expect(resolverGranularidade(base, mais(24))).toBe('hora');
    expect(resolverGranularidade(base, mais(72))).toBe('hora');
  });

  it('janela longa vira balde de dia', () => {
    expect(resolverGranularidade(base, mais(73))).toBe('dia');
    expect(resolverGranularidade(base, mais(24 * 30))).toBe('dia');
  });

  it('a escolha explícita ganha da automática', () => {
    expect(resolverGranularidade(base, mais(24 * 30), 'hora')).toBe('hora');
    expect(resolverGranularidade(base, mais(1), 'dia')).toBe('dia');
  });
});

describe('paraCsv', () => {
  const tabela: Tabela = {
    nome: 'Teste',
    colunas: [
      { chave: 'nome', titulo: 'Nome', largura: 10 },
      { chave: 'saldo', titulo: 'Saldo', largura: 10 },
    ],
    linhas: [
      { nome: 'Ana', saldo: 12 },
      { nome: 'Bruno; o "Grande"', saldo: 0 },
    ],
  };

  it('usa ; e BOM (o Excel pt-BR abre sem assistente de importação)', () => {
    const csv = paraCsv(tabela);
    expect(csv.startsWith('﻿')).toBe(true);
    expect(csv).toContain('Nome;Saldo');
  });

  it('escapa separador e aspas dentro do campo', () => {
    expect(paraCsv(tabela)).toContain('"Bruno; o ""Grande"""');
  });

  it('célula ausente vira vazio em vez de undefined', () => {
    const csv = paraCsv({ ...tabela, linhas: [{ nome: 'Ana' }] });
    expect(csv.trim().split('\r\n')[1]).toBe('Ana;');
  });
});
