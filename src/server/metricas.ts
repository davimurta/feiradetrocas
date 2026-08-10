// Agregações do painel de métricas do admin.
//
// Regra de ouro deste arquivo: **nada é agregado no client**. Toda contagem, soma e
// bucket de tempo sai pronto do Postgres (groupBy do Prisma ou SQL cru), porque no dia
// do evento a tabela `transacoes` cresce rápido e mandar linha bruta pro browser
// derrubaria a página. O client só desenha o que chega.
//
// Unidade de uma transação: `item.unidade` quando existe, senão `user.unidade`. O
// `ajuste_manual` não tem item, um INNER JOIN em items o descartaria silenciosamente
// (era o comportamento antigo), fazendo os totais não fecharem entre gráfico e KPI.

import { Prisma, type Unidade } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { resolverGranularidade, type FiltroMetricas, type Granularidade } from '@/lib/filtroMetricas';
import { getResumoDiscrepancias } from './queries';

/** Fuso do evento: os baldes de hora/dia precisam bater com o relógio da feira, não com UTC. */
const TZ = process.env.TZ_EVENTO ?? 'America/Sao_Paulo';

export type { FiltroMetricas, Granularidade };

export interface PontoTempo {
  balde: string; // 'YYYY-MM-DD HH:mm' no fuso do evento
  transacoes: number;
  creditos: number;
  debitos: number;
}

export interface ItemRanking {
  id: string;
  nome: string;
  categoria: string;
  unidade: Unidade;
  unidades: number;
  fichas: number;
}

export interface AtendenteAtividade {
  id: string;
  nome: string;
  papel: string;
  recebidos: number; // itens registrados na recepção
  creditados: number; // pushes para produção (transações de crédito)
  fichasCreditadas: number;
  pedidosCriados: number;
  pedidosAprovados: number;
  fichasVendidas: number;
}

export interface FatiaSimples {
  label: string;
  value: number;
}

export interface ResumoFichas {
  emitidas: number;
  gastas: number;
  ajustes: number;
  emCirculacao: number; // saldo somado AGORA (não depende da janela)
}

export interface ResumoPedidos {
  porStatus: FatiaSimples[];
  total: number;
  taxaRecusa: number; // 0..1 sobre os pedidos já resolvidos
  segundosMedioAprovacao: number | null;
}

export interface ResumoFila {
  pendentes: number;
  emProducao: number;
  segundosMedioAtePush: number | null;
}

export interface MetricasView {
  filtro: { de: string; ate: string; unidade: Unidade | null; granularidade: Granularidade };
  kpis: {
    transacoes: number;
    fichasEmCirculacao: number;
    itensEmEstoque: number;
    valorEstoque: number;
    produtosDistintos: number;
    itensEsgotados: number;
    usuarios: number;
    alunos: number;
    alunosBloqueados: number;
    contasPendentes: number;
  };
  serie: PontoTempo[];
  fichas: ResumoFichas;
  rankingItens: ItemRanking[];
  atendentes: AtendenteAtividade[];
  pedidos: ResumoPedidos;
  fila: ResumoFila;
  reportesPorMotivo: FatiaSimples[];
  /** Alertas de preço (`lib/alertas/discrepancia`), separados por origem. */
  discrepancias: { label: string; pendentes: number; catalogo: number }[];
  categorias: { label: string; estoque: number; vendidos: number }[];
  distribuicaoSaldo: FatiaSimples[];
}

// -- Série temporal ---------------------------------------------------------
// `generate_series` garante balde vazio no gráfico (hora sem venda vira zero, não some).

/** `date_trunc` só entende as unidades em inglês; a granularidade do domínio é em português. */
const UNIDADE_SQL: Record<Granularidade, string> = { hora: 'hour', dia: 'day' };

/**
 * `created_at` é `timestamp(3)` SEM fuso, gravado em UTC pelo Prisma. Um `AT TIME ZONE
 * <tz>` direto seria interpretado ao contrário (trataria o valor como hora local e
 * devolveria um instante), então primeiro rotulamos como UTC e só depois convertemos.
 * senão os baldes de hora saem deslocados e a "hora do pico" da feira mente.
 */
const emHorarioLocal = (coluna: string) =>
  Prisma.raw(`(${coluna} AT TIME ZONE 'UTC' AT TIME ZONE '${TZ.replace(/'/g, "''")}')`);

async function serieTemporal(f: FiltroMetricas, granularidade: Granularidade): Promise<PontoTempo[]> {
  const unidadeSql = UNIDADE_SQL[granularidade];
  const passo = granularidade === 'hora' ? '1 hour' : '1 day';
  const filtroUnidade = f.unidade
    ? Prisma.sql`AND coalesce(i.unidade, u.unidade) = ${f.unidade}::"Unidade"`
    : Prisma.empty;

  const linhas = await prisma.$queryRaw<
    { balde: string; transacoes: number; creditos: number; debitos: number }[]
  >(Prisma.sql`
    WITH janela AS (
      SELECT generate_series(
        date_trunc(${unidadeSql}, ${f.de}::timestamptz AT TIME ZONE ${TZ}),
        date_trunc(${unidadeSql}, ${f.ate}::timestamptz AT TIME ZONE ${TZ}),
        ${passo}::interval
      ) AS balde
    ),
    dados AS (
      SELECT
        date_trunc(${unidadeSql}, ${emHorarioLocal('t.created_at')}) AS balde,
        count(*)::int AS transacoes,
        coalesce(sum(CASE WHEN t.tipo = 'credito_entrada' THEN t.valor ELSE 0 END), 0)::int AS creditos,
        coalesce(sum(CASE WHEN t.tipo = 'debito_compra' THEN abs(t.valor) ELSE 0 END), 0)::int AS debitos
      FROM transacoes t
      LEFT JOIN items i ON i.id = t.item_id
      JOIN users u ON u.id = t.user_id
      WHERE t.created_at >= ${f.de} AND t.created_at <= ${f.ate}
      ${filtroUnidade}
      GROUP BY 1
    )
    SELECT
      to_char(j.balde, 'YYYY-MM-DD HH24:MI') AS balde,
      coalesce(d.transacoes, 0)::int AS transacoes,
      coalesce(d.creditos, 0)::int AS creditos,
      coalesce(d.debitos, 0)::int AS debitos
    FROM janela j
    LEFT JOIN dados d ON d.balde = j.balde
    ORDER BY j.balde
  `);
  return linhas;
}

// -- Ranking de itens -------------------------------------------------------

async function rankingItens(f: FiltroMetricas, limite = 10): Promise<ItemRanking[]> {
  const filtroUnidade = f.unidade ? Prisma.sql`AND i.unidade = ${f.unidade}::"Unidade"` : Prisma.empty;
  return prisma.$queryRaw<ItemRanking[]>(Prisma.sql`
    SELECT i.id, i.nome, i.categoria, i.unidade::text AS unidade,
           sum(t.quantidade)::int AS unidades,
           sum(abs(t.valor))::int AS fichas
    FROM transacoes t
    JOIN items i ON i.id = t.item_id
    WHERE t.tipo = 'debito_compra'
      AND t.created_at >= ${f.de} AND t.created_at <= ${f.ate}
      ${filtroUnidade}
    GROUP BY i.id, i.nome, i.categoria, i.unidade
    ORDER BY unidades DESC, fichas DESC
    LIMIT ${limite}
  `);
}

// -- Atendentes -------------------------------------------------------------
// Três agregações por atendente, unidas em memória: a cardinalidade aqui é o nº de
// atendentes da feira (dezenas), não o nº de transações.

async function atividadePorAtendente(f: FiltroMetricas): Promise<AtendenteAtividade[]> {
  const janela = { gte: f.de, lte: f.ate };
  const [recepcao, creditos, pedidos] = await Promise.all([
    prisma.itemPendente.groupBy({
      by: ['atendenteId'],
      _count: { _all: true },
      where: { createdAt: janela, ...(f.unidade ? { unidade: f.unidade } : {}) },
    }),
    prisma.transacao.groupBy({
      by: ['atendenteId'],
      _count: { _all: true },
      _sum: { valor: true },
      where: {
        tipo: 'credito_entrada',
        createdAt: janela,
        atendenteId: { not: null },
        ...(f.unidade ? { item: { unidade: f.unidade } } : {}),
      },
    }),
    prisma.pedido.groupBy({
      by: ['atendenteId', 'status'],
      _count: { _all: true },
      _sum: { valor: true },
      where: { createdAt: janela, ...(f.unidade ? { item: { unidade: f.unidade } } : {}) },
    }),
  ]);

  const mapa = new Map<string, AtendenteAtividade>();
  const linha = (id: string) => {
    let atual = mapa.get(id);
    if (!atual) {
      atual = {
        id,
        nome: id,
        papel: '',
        recebidos: 0,
        creditados: 0,
        fichasCreditadas: 0,
        pedidosCriados: 0,
        pedidosAprovados: 0,
        fichasVendidas: 0,
      };
      mapa.set(id, atual);
    }
    return atual;
  };

  for (const r of recepcao) linha(r.atendenteId).recebidos += r._count._all;
  for (const c of creditos) {
    if (!c.atendenteId) continue;
    const l = linha(c.atendenteId);
    l.creditados += c._count._all;
    l.fichasCreditadas += c._sum.valor ?? 0;
  }
  for (const p of pedidos) {
    const l = linha(p.atendenteId);
    l.pedidosCriados += p._count._all;
    if (p.status === 'aprovado') {
      l.pedidosAprovados += p._count._all;
      l.fichasVendidas += p._sum.valor ?? 0;
    }
  }

  const ids = [...mapa.keys()];
  if (ids.length === 0) return [];
  const usuarios = await prisma.user.findMany({
    where: { id: { in: ids } },
    select: { id: true, nome: true, papel: true },
  });
  for (const u of usuarios) {
    const l = mapa.get(u.id);
    if (l) {
      l.nome = u.nome;
      l.papel = u.papel;
    }
  }
  return [...mapa.values()].sort(
    (a, b) => b.recebidos + b.pedidosAprovados - (a.recebidos + a.pedidosAprovados),
  );
}

// -- Pedidos, fila, reportes, categorias, saldo -----------------------------

async function resumoPedidos(f: FiltroMetricas): Promise<ResumoPedidos> {
  const where = { createdAt: { gte: f.de, lte: f.ate }, ...(f.unidade ? { item: { unidade: f.unidade } } : {}) };
  const filtroUnidade = f.unidade
    ? Prisma.sql`AND i.unidade = ${f.unidade}::"Unidade"`
    : Prisma.empty;

  const [porStatus, tempo] = await Promise.all([
    prisma.pedido.groupBy({ by: ['status'], _count: { _all: true }, where }),
    prisma.$queryRaw<{ segundos: number | null }[]>(Prisma.sql`
      SELECT avg(EXTRACT(EPOCH FROM (p.updated_at - p.created_at)))::float AS segundos
      FROM pedidos p
      JOIN items i ON i.id = p.item_id
      WHERE p.status = 'aprovado'
        AND p.created_at >= ${f.de} AND p.created_at <= ${f.ate}
        ${filtroUnidade}
    `),
  ]);

  const conta = (s: string) => porStatus.find((p) => p.status === s)?._count._all ?? 0;
  const aprovados = conta('aprovado');
  const recusados = conta('recusado');
  const resolvidos = aprovados + recusados;

  return {
    porStatus: [
      { label: 'aprovado', value: aprovados },
      { label: 'pendente', value: conta('pendente') },
      { label: 'recusado', value: recusados },
      { label: 'cancelado', value: conta('cancelado') },
    ],
    total: porStatus.reduce((s, p) => s + p._count._all, 0),
    taxaRecusa: resolvidos === 0 ? 0 : recusados / resolvidos,
    segundosMedioAprovacao: tempo[0]?.segundos ?? null,
  };
}

async function resumoFila(f: FiltroMetricas): Promise<ResumoFila> {
  const unidadeWhere = f.unidade ? { unidade: f.unidade } : {};
  const filtroUnidade = f.unidade ? Prisma.sql`AND unidade = ${f.unidade}::"Unidade"` : Prisma.empty;
  const [porStatus, tempo] = await Promise.all([
    prisma.itemPendente.groupBy({ by: ['status'], _count: { _all: true }, where: unidadeWhere }),
    prisma.$queryRaw<{ segundos: number | null }[]>(Prisma.sql`
      SELECT avg(EXTRACT(EPOCH FROM (updated_at - created_at)))::float AS segundos
      FROM itens_pendentes
      WHERE status = 'producao'
        AND created_at >= ${f.de} AND created_at <= ${f.ate}
        ${filtroUnidade}
    `),
  ]);
  const conta = (s: string) => porStatus.find((p) => p.status === s)?._count._all ?? 0;
  return {
    pendentes: conta('pendente'),
    emProducao: conta('producao'),
    segundosMedioAtePush: tempo[0]?.segundos ?? null,
  };
}

async function reportesPorMotivo(f: FiltroMetricas): Promise<FatiaSimples[]> {
  const linhas = await prisma.reporte.groupBy({
    by: ['motivo'],
    _count: { _all: true },
    where: {
      createdAt: { gte: f.de, lte: f.ate },
      ...(f.unidade ? { reportado: { unidade: f.unidade } } : {}),
    },
  });
  return linhas
    .map((r) => ({ label: r.motivo, value: r._count._all }))
    .sort((a, b) => b.value - a.value);
}

async function porCategoria(f: FiltroMetricas) {
  const filtroUnidade = f.unidade ? Prisma.sql`AND i.unidade = ${f.unidade}::"Unidade"` : Prisma.empty;
  const [estoque, vendidos] = await Promise.all([
    prisma.item.groupBy({
      by: ['categoria'],
      _sum: { quantidade: true },
      where: f.unidade ? { unidade: f.unidade } : {},
    }),
    prisma.$queryRaw<{ categoria: string; vendidos: number }[]>(Prisma.sql`
      SELECT i.categoria, sum(t.quantidade)::int AS vendidos
      FROM transacoes t
      JOIN items i ON i.id = t.item_id
      WHERE t.tipo = 'debito_compra'
        AND t.created_at >= ${f.de} AND t.created_at <= ${f.ate}
        ${filtroUnidade}
      GROUP BY i.categoria
    `),
  ]);
  const mapaVendidos = new Map(vendidos.map((v) => [v.categoria, v.vendidos]));
  const categorias = new Set([...estoque.map((e) => e.categoria), ...mapaVendidos.keys()]);
  return [...categorias]
    .map((c) => ({
      label: c,
      estoque: estoque.find((e) => e.categoria === c)?._sum.quantidade ?? 0,
      vendidos: mapaVendidos.get(c) ?? 0,
    }))
    .sort((a, b) => b.estoque + b.vendidos - (a.estoque + a.vendidos));
}

/** Histograma de saldo dos alunos, mostra concentração de fichas paradas. */
async function distribuicaoSaldo(f: FiltroMetricas): Promise<FatiaSimples[]> {
  const filtroUnidade = f.unidade ? Prisma.sql`AND unidade = ${f.unidade}::"Unidade"` : Prisma.empty;
  const linhas = await prisma.$queryRaw<{ faixa: string; ordem: number; total: number }[]>(Prisma.sql`
    SELECT faixa, ordem, count(*)::int AS total FROM (
      SELECT CASE
        WHEN saldo <= 0 THEN '0'
        WHEN saldo <= 5 THEN '1–5'
        WHEN saldo <= 10 THEN '6–10'
        WHEN saldo <= 20 THEN '11–20'
        WHEN saldo <= 50 THEN '21–50'
        ELSE '50+'
      END AS faixa,
      CASE
        WHEN saldo <= 0 THEN 0
        WHEN saldo <= 5 THEN 1
        WHEN saldo <= 10 THEN 2
        WHEN saldo <= 20 THEN 3
        WHEN saldo <= 50 THEN 4
        ELSE 5
      END AS ordem
      FROM users
      WHERE papel = 'participante'
      ${filtroUnidade}
    ) f
    GROUP BY faixa, ordem
    ORDER BY ordem
  `);
  return linhas.map((l) => ({ label: l.faixa, value: l.total }));
}

// -- Entrada única ----------------------------------------------------------

export async function getMetricas(filtro: FiltroMetricas): Promise<MetricasView> {
  const granularidade = resolverGranularidade(filtro.de, filtro.ate, filtro.granularidade);
  const janela = { gte: filtro.de, lte: filtro.ate };
  const unidadeWhere = filtro.unidade ? { unidade: filtro.unidade } : {};
  const transWhere = {
    createdAt: janela,
    ...(filtro.unidade
      ? {
          OR: [
            { item: { unidade: filtro.unidade } },
            { item: { is: null }, user: { unidade: filtro.unidade } },
          ],
        }
      : {}),
  };

  const [
    serie,
    ranking,
    atendentes,
    pedidos,
    fila,
    reportes,
    discrepancias,
    categorias,
    saldos,
    porTipo,
    somaSaldo,
    estoque,
    produtosDistintos,
    itensEsgotados,
    totalTransacoes,
    usuarios,
    alunos,
    bloqueados,
    contasPendentes,
    valorEstoqueRaw,
  ] = await Promise.all([
    serieTemporal(filtro, granularidade),
    rankingItens(filtro),
    atividadePorAtendente(filtro),
    resumoPedidos(filtro),
    resumoFila(filtro),
    reportesPorMotivo(filtro),
    getResumoDiscrepancias(filtro.unidade),
    porCategoria(filtro),
    distribuicaoSaldo(filtro),
    prisma.transacao.groupBy({ by: ['tipo'], _sum: { valor: true }, where: transWhere }),
    prisma.user.aggregate({ _sum: { saldo: true }, where: unidadeWhere }),
    prisma.item.aggregate({ _sum: { quantidade: true }, where: unidadeWhere }),
    prisma.item.count({ where: unidadeWhere }),
    prisma.item.count({ where: { ...unidadeWhere, quantidade: { lte: 0 } } }),
    prisma.transacao.count({ where: transWhere }),
    prisma.user.count({ where: unidadeWhere }),
    prisma.user.count({ where: { ...unidadeWhere, papel: 'participante' } }),
    prisma.user.count({ where: { ...unidadeWhere, bloqueado: true } }),
    prisma.user.count({ where: { ...unidadeWhere, pendente: true } }),
    prisma.$queryRaw<{ total: number | null }[]>(
      filtro.unidade
        ? Prisma.sql`SELECT sum(valor * quantidade)::int AS total FROM items WHERE unidade = ${filtro.unidade}::"Unidade"`
        : Prisma.sql`SELECT sum(valor * quantidade)::int AS total FROM items`,
    ),
  ]);

  const soma = (tipo: string) => porTipo.find((t) => t.tipo === tipo)?._sum.valor ?? 0;
  const emitidas = soma('credito_entrada');
  const gastas = Math.abs(soma('debito_compra'));

  return {
    filtro: {
      de: filtro.de.toISOString(),
      ate: filtro.ate.toISOString(),
      unidade: filtro.unidade ?? null,
      granularidade,
    },
    kpis: {
      transacoes: totalTransacoes,
      fichasEmCirculacao: somaSaldo._sum.saldo ?? 0,
      itensEmEstoque: estoque._sum.quantidade ?? 0,
      valorEstoque: valorEstoqueRaw[0]?.total ?? 0,
      produtosDistintos,
      itensEsgotados,
      usuarios,
      alunos,
      alunosBloqueados: bloqueados,
      contasPendentes,
    },
    serie,
    fichas: {
      emitidas,
      gastas,
      ajustes: soma('ajuste_manual'),
      emCirculacao: somaSaldo._sum.saldo ?? 0,
    },
    rankingItens: ranking,
    atendentes,
    pedidos,
    fila,
    reportesPorMotivo: reportes,
    discrepancias,
    categorias,
    distribuicaoSaldo: saldos,
  };
}
