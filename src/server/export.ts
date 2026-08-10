// Exportação das métricas do admin em planilha (.xlsx) ou .csv.
//
// Roda inteiro no servidor: o browser recebe só o arquivo pronto. Duas razões:
// a lib de xlsx (exceljs) nunca entra no bundle do client, e as linhas brutas nunca
// trafegam como payload RSC.
//
// As leituras são paginadas por cursor (`LOTE`) em vez de um findMany único: no dia
// do evento a tabela de transações não cabe confortavelmente numa tacada só.

import { prisma } from '@/lib/prisma';
import type { Tabela } from '@/lib/planilha';
import { getMetricas, type FiltroMetricas } from './metricas';

export { paraCsv, paraXlsx } from '@/lib/planilha';
export type { Tabela, Coluna } from '@/lib/planilha';

const LOTE = 1000;
/** Teto por aba: rede de segurança contra um export que trave o servidor. */
const MAX_LINHAS = 100_000;

export const DATASETS = ['transacoes', 'saldos', 'itens', 'status', 'resumo'] as const;
export type Dataset = (typeof DATASETS)[number];

const dataHora = (d: Date) =>
  new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'medium' }).format(d);

async function paginar<T>(consulta: (cursor: string | undefined) => Promise<(T & { id: string })[]>) {
  const tudo: (T & { id: string })[] = [];
  let cursor: string | undefined;
  for (;;) {
    const lote = await consulta(cursor);
    tudo.push(...lote);
    if (lote.length < LOTE || tudo.length >= MAX_LINHAS) break;
    cursor = lote[lote.length - 1].id;
  }
  return tudo;
}

// -- Datasets ---------------------------------------------------------------

async function tabelaTransacoes(f: FiltroMetricas): Promise<Tabela> {
  const linhas = await paginar((cursor) =>
    prisma.transacao.findMany({
      where: {
        createdAt: { gte: f.de, lte: f.ate },
        ...(f.unidade
          ? { OR: [{ item: { unidade: f.unidade } }, { item: { is: null }, user: { unidade: f.unidade } }] }
          : {}),
      },
      orderBy: { id: 'asc' },
      take: LOTE,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: {
        id: true,
        tipo: true,
        valor: true,
        quantidade: true,
        createdAt: true,
        user: { select: { nome: true, codigoCarteira: true, unidade: true } },
        atendente: { select: { nome: true } },
        item: { select: { nome: true, categoria: true, unidade: true } },
      },
    }),
  );

  return {
    nome: 'Transações',
    colunas: [
      { chave: 'id', titulo: 'ID', largura: 28 },
      { chave: 'data', titulo: 'Data/hora', largura: 20 },
      { chave: 'tipo', titulo: 'Tipo', largura: 18 },
      { chave: 'valor', titulo: 'Fichas', largura: 10 },
      { chave: 'quantidade', titulo: 'Qtd.', largura: 8 },
      { chave: 'participante', titulo: 'Participante', largura: 26 },
      { chave: 'matricula', titulo: 'Matrícula', largura: 14 },
      { chave: 'atendente', titulo: 'Atendente', largura: 26 },
      { chave: 'item', titulo: 'Item', largura: 26 },
      { chave: 'categoria', titulo: 'Categoria', largura: 18 },
      { chave: 'unidade', titulo: 'Unidade', largura: 12 },
    ],
    linhas: linhas.map((t) => ({
      id: t.id,
      data: dataHora(t.createdAt),
      tipo: t.tipo,
      valor: t.valor,
      quantidade: t.quantidade,
      participante: t.user.nome,
      matricula: t.user.codigoCarteira,
      atendente: t.atendente?.nome ?? '',
      item: t.item?.nome ?? '',
      categoria: t.item?.categoria ?? '',
      unidade: t.item?.unidade ?? t.user.unidade,
    })),
  };
}

async function tabelaSaldos(f: FiltroMetricas): Promise<Tabela> {
  const [usuarios, porUsuario] = await Promise.all([
    paginar((cursor) =>
      prisma.user.findMany({
        where: f.unidade ? { unidade: f.unidade } : {},
        orderBy: { id: 'asc' },
        take: LOTE,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        select: {
          id: true,
          nome: true,
          email: true,
          codigoCarteira: true,
          papel: true,
          unidade: true,
          saldo: true,
          bloqueado: true,
          pendente: true,
        },
      }),
    ),
    // Creditado/gasto por participante direto do banco (nunca somado no client).
    prisma.transacao.groupBy({
      by: ['userId', 'tipo'],
      _sum: { valor: true },
      where: { createdAt: { gte: f.de, lte: f.ate } },
    }),
  ]);

  const movimento = new Map<string, { creditado: number; gasto: number; ajustes: number }>();
  for (const m of porUsuario) {
    const atual = movimento.get(m.userId) ?? { creditado: 0, gasto: 0, ajustes: 0 };
    const v = m._sum.valor ?? 0;
    if (m.tipo === 'credito_entrada') atual.creditado += v;
    else if (m.tipo === 'debito_compra') atual.gasto += Math.abs(v);
    else atual.ajustes += v;
    movimento.set(m.userId, atual);
  }

  return {
    nome: 'Saldos',
    colunas: [
      { chave: 'nome', titulo: 'Nome', largura: 28 },
      { chave: 'matricula', titulo: 'Matrícula', largura: 14 },
      { chave: 'email', titulo: 'E-mail', largura: 34 },
      { chave: 'papel', titulo: 'Papel', largura: 18 },
      { chave: 'unidade', titulo: 'Unidade', largura: 12 },
      { chave: 'saldo', titulo: 'Saldo atual', largura: 12 },
      { chave: 'creditado', titulo: 'Fichas recebidas', largura: 16 },
      { chave: 'gasto', titulo: 'Fichas gastas', largura: 14 },
      { chave: 'ajustes', titulo: 'Ajustes manuais', largura: 16 },
      { chave: 'bloqueado', titulo: 'Bloqueado', largura: 12 },
      { chave: 'pendente', titulo: 'Conta pendente', largura: 15 },
    ],
    linhas: usuarios.map((u) => {
      const m = movimento.get(u.id) ?? { creditado: 0, gasto: 0, ajustes: 0 };
      return {
        nome: u.nome,
        matricula: u.codigoCarteira,
        email: u.email,
        papel: u.papel,
        unidade: u.unidade,
        saldo: u.saldo,
        creditado: m.creditado,
        gasto: m.gasto,
        ajustes: m.ajustes,
        bloqueado: u.bloqueado ? 'sim' : 'não',
        pendente: u.pendente ? 'sim' : 'não',
      };
    }),
  };
}

async function tabelaItens(f: FiltroMetricas): Promise<Tabela> {
  const [itens, pendentes] = await Promise.all([
    paginar((cursor) =>
      prisma.item.findMany({
        where: f.unidade ? { unidade: f.unidade } : {},
        orderBy: { id: 'asc' },
        take: LOTE,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        select: {
          id: true,
          codigo: true,
          nome: true,
          categoria: true,
          valor: true,
          quantidade: true,
          unidade: true,
          descricao: true,
          createdAt: true,
        },
      }),
    ),
    prisma.itemPendente.findMany({
      where: { status: 'pendente', ...(f.unidade ? { unidade: f.unidade } : {}) },
      take: MAX_LINHAS,
      select: {
        codigo: true,
        nome: true,
        categoria: true,
        valor: true,
        quantidade: true,
        unidade: true,
        descricao: true,
        createdAt: true,
      },
    }),
  ]);

  return {
    nome: 'Itens',
    colunas: [
      { chave: 'origem', titulo: 'Origem', largura: 12 },
      { chave: 'codigo', titulo: 'Código', largura: 16 },
      { chave: 'nome', titulo: 'Nome', largura: 28 },
      { chave: 'categoria', titulo: 'Categoria', largura: 18 },
      { chave: 'valor', titulo: 'Valor (fichas)', largura: 14 },
      { chave: 'quantidade', titulo: 'Quantidade', largura: 12 },
      { chave: 'total', titulo: 'Total em fichas', largura: 15 },
      { chave: 'unidade', titulo: 'Unidade', largura: 12 },
      { chave: 'criado', titulo: 'Criado em', largura: 20 },
      { chave: 'descricao', titulo: 'Descrição', largura: 40 },
    ],
    linhas: [
      ...itens.map((i) => ({
        origem: 'catálogo',
        codigo: i.codigo,
        nome: i.nome,
        categoria: i.categoria,
        valor: i.valor,
        quantidade: i.quantidade,
        total: i.valor * i.quantidade,
        unidade: i.unidade,
        criado: dataHora(i.createdAt),
        descricao: i.descricao ?? '',
      })),
      ...pendentes.map((p) => ({
        origem: 'recepção',
        codigo: p.codigo,
        nome: p.nome,
        categoria: p.categoria,
        valor: p.valor,
        quantidade: p.quantidade,
        total: p.valor * p.quantidade,
        unidade: p.unidade,
        criado: dataHora(p.createdAt),
        descricao: p.descricao ?? '',
      })),
    ],
  };
}

async function tabelaStatus(f: FiltroMetricas): Promise<Tabela> {
  const linhas = await paginar((cursor) =>
    prisma.pedido.findMany({
      where: {
        createdAt: { gte: f.de, lte: f.ate },
        ...(f.unidade ? { item: { unidade: f.unidade } } : {}),
      },
      orderBy: { id: 'asc' },
      take: LOTE,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: {
        id: true,
        status: true,
        valor: true,
        quantidade: true,
        motivoRecusa: true,
        createdAt: true,
        updatedAt: true,
        item: { select: { nome: true, categoria: true, unidade: true } },
        comprador: { select: { nome: true, codigoCarteira: true } },
        atendente: { select: { nome: true } },
      },
    }),
  );

  return {
    nome: 'Status',
    colunas: [
      { chave: 'id', titulo: 'ID', largura: 28 },
      { chave: 'status', titulo: 'Status', largura: 14 },
      { chave: 'criado', titulo: 'Criado em', largura: 20 },
      { chave: 'atualizado', titulo: 'Resolvido em', largura: 20 },
      { chave: 'segundos', titulo: 'Segundos até resolver', largura: 20 },
      { chave: 'item', titulo: 'Item', largura: 26 },
      { chave: 'categoria', titulo: 'Categoria', largura: 18 },
      { chave: 'valor', titulo: 'Fichas', largura: 10 },
      { chave: 'comprador', titulo: 'Comprador', largura: 26 },
      { chave: 'matricula', titulo: 'Matrícula', largura: 14 },
      { chave: 'atendente', titulo: 'Atendente', largura: 26 },
      { chave: 'unidade', titulo: 'Unidade', largura: 12 },
      { chave: 'motivo', titulo: 'Motivo da recusa', largura: 34 },
    ],
    linhas: linhas.map((p) => ({
      id: p.id,
      status: p.status,
      criado: dataHora(p.createdAt),
      atualizado: p.status === 'pendente' ? '' : dataHora(p.updatedAt),
      segundos:
        p.status === 'pendente'
          ? ''
          : Math.round((p.updatedAt.getTime() - p.createdAt.getTime()) / 1000),
      item: p.item.nome,
      categoria: p.item.categoria,
      valor: p.valor,
      comprador: p.comprador.nome,
      matricula: p.comprador.codigoCarteira,
      atendente: p.atendente.nome,
      unidade: p.item.unidade,
      motivo: p.motivoRecusa ?? '',
    })),
  };
}

/** Aba de agregados, os mesmos números que o painel mostra, em formato chave/valor. */
async function tabelaResumo(f: FiltroMetricas): Promise<Tabela> {
  const m = await getMetricas(f);
  const linhas: Record<string, string | number>[] = [
    { indicador: 'Período (de)', valor: dataHora(f.de) },
    { indicador: 'Período (até)', valor: dataHora(f.ate) },
    { indicador: 'Unidade', valor: f.unidade ?? 'ambas' },
    { indicador: 'Transações no período', valor: m.kpis.transacoes },
    { indicador: 'Fichas emitidas', valor: m.fichas.emitidas },
    { indicador: 'Fichas gastas', valor: m.fichas.gastas },
    { indicador: 'Ajustes manuais (líquido)', valor: m.fichas.ajustes },
    { indicador: 'Fichas em circulação', valor: m.fichas.emCirculacao },
    { indicador: 'Itens em estoque', valor: m.kpis.itensEmEstoque },
    { indicador: 'Valor do estoque (fichas)', valor: m.kpis.valorEstoque },
    { indicador: 'Produtos distintos', valor: m.kpis.produtosDistintos },
    { indicador: 'Produtos esgotados', valor: m.kpis.itensEsgotados },
    { indicador: 'Usuários', valor: m.kpis.usuarios },
    { indicador: 'Alunos', valor: m.kpis.alunos },
    { indicador: 'Alunos bloqueados', valor: m.kpis.alunosBloqueados },
    { indicador: 'Contas pendentes', valor: m.kpis.contasPendentes },
    { indicador: 'Pedidos no período', valor: m.pedidos.total },
    { indicador: 'Taxa de recusa', valor: `${(m.pedidos.taxaRecusa * 100).toFixed(1)}%` },
    {
      indicador: 'Tempo médio de aprovação (s)',
      valor: m.pedidos.segundosMedioAprovacao === null ? '' : Math.round(m.pedidos.segundosMedioAprovacao),
    },
    { indicador: 'Fila da recepção (pendentes)', valor: m.fila.pendentes },
    {
      indicador: 'Tempo médio até o push (s)',
      valor: m.fila.segundosMedioAtePush === null ? '' : Math.round(m.fila.segundosMedioAtePush),
    },
    ...m.pedidos.porStatus.map((s) => ({ indicador: `Pedidos ${s.label}`, valor: s.value })),
    ...m.reportesPorMotivo.map((r) => ({ indicador: `Reportes: ${r.label}`, valor: r.value })),
    ...m.rankingItens.map((i, n) => ({
      indicador: `Top ${n + 1} item vendido`,
      valor: `${i.nome}: ${i.unidades} un. / ${i.fichas} fichas`,
    })),
    ...m.atendentes.map((a) => ({
      indicador: `Atendente: ${a.nome}`,
      valor: `${a.recebidos} recebidos · ${a.creditados} creditados · ${a.pedidosAprovados} vendas`,
    })),
  ];

  return {
    nome: 'Resumo',
    colunas: [
      { chave: 'indicador', titulo: 'Indicador', largura: 34 },
      { chave: 'valor', titulo: 'Valor', largura: 46 },
    ],
    linhas,
  };
}

const CONSTRUTORES: Record<Dataset, (f: FiltroMetricas) => Promise<Tabela>> = {
  resumo: tabelaResumo,
  transacoes: tabelaTransacoes,
  saldos: tabelaSaldos,
  itens: tabelaItens,
  status: tabelaStatus,
};

export function montarTabela(dataset: Dataset, filtro: FiltroMetricas): Promise<Tabela> {
  return CONSTRUTORES[dataset](filtro);
}
