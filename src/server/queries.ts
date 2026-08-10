import { cache } from 'react';
import type { Papel, Unidade } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { normalizarIdentificador } from '@/domain/auth';
import { avaliarItem, type ItemAvaliavel, type MotivoAlerta } from '@/lib/alertas/discrepancia';

export interface CarteiraView {
  id: string;
  nome: string;
  email: string;
  papel: Papel;
  saldo: number;
  codigoCarteira: string;
}

export function getCarteira(userId: string): Promise<CarteiraView | null> {
  return prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, nome: true, email: true, papel: true, saldo: true, codigoCarteira: true },
  });
}

export interface ProdutoView {
  id: string;
  codigo: string;
  nome: string;
  categoria: string;
  valor: number;
  quantidade: number;
}

const PRODUTO_SELECT = {
  id: true,
  codigo: true,
  nome: true,
  categoria: true,
  valor: true,
  quantidade: true,
} as const;

export function getCatalogo(unidade: Unidade, busca?: string): Promise<ProdutoView[]> {
  const q = busca?.trim();
  return prisma.item.findMany({
    where: {
      unidade,
      quantidade: { gt: 0 },
      ...(q
        ? { OR: [{ nome: { contains: q, mode: 'insensitive' } }, { categoria: { contains: q, mode: 'insensitive' } }] }
        : {}),
    },
    orderBy: { nome: 'asc' },
    select: PRODUTO_SELECT,
  });
}

export function buscarItensPorNome(unidade: Unidade, nome: string, limit = 8): Promise<ProdutoView[]> {
  const q = nome.trim();
  if (!q) return Promise.resolve([]);
  return prisma.item.findMany({
    where: { unidade, nome: { contains: q, mode: 'insensitive' } },
    orderBy: [{ nome: 'asc' }, { valor: 'asc' }],
    take: limit,
    select: PRODUTO_SELECT,
  });
}

export interface AlunoView {
  id: string;
  nome: string;
  email: string;
  saldo: number;
  codigoCarteira: string;
}

export function buscarAlunoPorIdentificador(identificador: string): Promise<AlunoView | null> {
  const { email, carteira } = normalizarIdentificador(identificador);
  return prisma.user.findFirst({
    where: { OR: [{ email }, { codigoCarteira: carteira }] },
    select: { id: true, nome: true, email: true, saldo: true, codigoCarteira: true },
  });
}

export interface ItemPendenteView {
  id: string;
  codigo: string;
  nome: string;
  categoria: string;
  valor: number;
  quantidade: number;
  unidade: Unidade;
  descricao: string | null;
  alunoNome: string;
  alunoMatricula: string;
  createdAt: Date;
}

export async function listarItensPendentes(unidade?: Unidade): Promise<ItemPendenteView[]> {
  const linhas = await prisma.itemPendente.findMany({
    where: { status: 'pendente', ...(unidade ? { unidade } : {}) },
    orderBy: { createdAt: 'asc' },
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
      aluno: { select: { nome: true, codigoCarteira: true } },
    },
  });
  return linhas.map((p) => ({
    id: p.id,
    codigo: p.codigo,
    nome: p.nome,
    categoria: p.categoria,
    valor: p.valor,
    quantidade: p.quantidade,
    unidade: p.unidade,
    descricao: p.descricao,
    alunoNome: p.aluno.nome,
    alunoMatricula: p.aluno.codigoCarteira,
    createdAt: p.createdAt,
  }));
}

export interface PedidoPendenteView {
  id: string;
  itemNome: string;
  valor: number;
  atendenteNome: string;
  unidade: Unidade;
  descricao: string | null;
  createdAt: Date;
}

export async function getPedidosPendentesDoComprador(compradorId: string): Promise<PedidoPendenteView[]> {
  const linhas = await prisma.pedido.findMany({
    where: { compradorId, status: 'pendente' },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      valor: true,
      createdAt: true,
      item: { select: { nome: true, unidade: true, descricao: true } },
      atendente: { select: { nome: true } },
    },
  });
  return linhas.map((p) => ({
    id: p.id,
    itemNome: p.item.nome,
    valor: p.valor,
    atendenteNome: p.atendente.nome,
    unidade: p.item.unidade,
    descricao: p.item.descricao,
    createdAt: p.createdAt,
  }));
}

export interface PedidoStatusView {
  status: string;
  motivoRecusa: string | null;
}

export function consultarPedido(pedidoId: string): Promise<PedidoStatusView | null> {
  return prisma.pedido.findUnique({ where: { id: pedidoId }, select: { status: true, motivoRecusa: true } });
}

export interface ExtratoItem {
  id: string;
  tipo: string;
  valor: number;
  quantidade: number;
  createdAt: Date;
  itemNome: string | null;
}

export async function getHistorico(userId: string, limit = 100): Promise<ExtratoItem[]> {
  const linhas = await prisma.transacao.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: limit,
    select: {
      id: true,
      tipo: true,
      valor: true,
      quantidade: true,
      createdAt: true,
      item: { select: { nome: true } },
    },
  });
  return linhas.map((t) => ({
    id: t.id,
    tipo: t.tipo,
    valor: t.valor,
    quantidade: t.quantidade,
    createdAt: t.createdAt,
    itemNome: t.item?.nome ?? null,
  }));
}

export interface ItemAdmin {
  id: string;
  codigo: string;
  nome: string;
  categoria: string;
  valor: number;
  quantidade: number;
  unidade: Unidade;
  descricao: string | null;
}

export function listarItensAdmin(busca?: string, unidade?: Unidade): Promise<ItemAdmin[]> {
  const q = busca?.trim();
  return prisma.item.findMany({
    where: {
      ...(unidade ? { unidade } : {}),
      ...(q ? { OR: [{ nome: { contains: q, mode: 'insensitive' } }, { categoria: { contains: q, mode: 'insensitive' } }] } : {}),
    },
    orderBy: [{ unidade: 'asc' }, { nome: 'asc' }],
    select: { id: true, codigo: true, nome: true, categoria: true, valor: true, quantidade: true, unidade: true, descricao: true },
  });
}

export interface UsuarioAdmin {
  id: string;
  nome: string;
  email: string;
  papel: Papel;
  unidade: Unidade;
  saldo: number;
  codigoCarteira: string;
  pendente: boolean;
}

export function listarUsuariosAdmin(busca?: string, unidade?: Unidade): Promise<UsuarioAdmin[]> {
  const q = busca?.trim();
  return prisma.user.findMany({
    where: {
      ...(unidade ? { unidade } : {}),
      ...(q ? { OR: [{ nome: { contains: q, mode: 'insensitive' } }, { email: { contains: q, mode: 'insensitive' } }, { codigoCarteira: { contains: q, mode: 'insensitive' } }] } : {}),
    },
    orderBy: [{ pendente: 'desc' }, { papel: 'asc' }, { nome: 'asc' }],
    select: { id: true, nome: true, email: true, papel: true, unidade: true, saldo: true, codigoCarteira: true, pendente: true },
  });
}

export interface ReporteView {
  id: string;
  motivo: string;
  descricao: string | null;
  createdAt: Date;
  reportadoId: string;
  reportadoNome: string;
  reportadoMatricula: string;
  reportadoSaldo: number;
  reportadoBloqueado: boolean;
  reportanteNome: string;
}

export async function listarReportes(): Promise<ReporteView[]> {
  const linhas = await prisma.reporte.findMany({
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      motivo: true,
      descricao: true,
      createdAt: true,
      reportado: { select: { id: true, nome: true, codigoCarteira: true, saldo: true, bloqueado: true } },
      reportante: { select: { nome: true } },
    },
  });
  return linhas.map((r) => ({
    id: r.id,
    motivo: r.motivo,
    descricao: r.descricao,
    createdAt: r.createdAt,
    reportadoId: r.reportado.id,
    reportadoNome: r.reportado.nome,
    reportadoMatricula: r.reportado.codigoCarteira,
    reportadoSaldo: r.reportado.saldo,
    reportadoBloqueado: r.reportado.bloqueado,
    reportanteNome: r.reportante.nome,
  }));
}

// Alertas de discrepância de preço (informativos, não bloqueiam nada) --------
// A referência é sempre a feira inteira agrupada por categoria (pendentes + catálogo),
// para maximizar a amostra e funcionar desde o começo, mesmo com catálogo pequeno.

export interface AlertaDiscrepanciaView {
  itemId: string;
  nome: string;
  categoria: string;
  unidade: Unidade;
  valor: number;
  aluno: string | null; // pendente: quem trouxe; catálogo: null
  origem: 'pendente' | 'catalogo';
  motivos: MotivoAlerta[];
}

// `cache` por request: a tela do admin pede alertas do catálogo e o resumo de
// discrepâncias na mesma renderização, sem isso o universo de preços seria lido duas vezes.
const carregarUniversoDePrecos = cache(async function carregarUniversoDePrecos() {
  const [pendentes, catalogo] = await Promise.all([
    prisma.itemPendente.findMany({
      where: { status: 'pendente' },
      select: { id: true, nome: true, categoria: true, valor: true, unidade: true, aluno: { select: { nome: true } } },
    }),
    prisma.item.findMany({ select: { id: true, nome: true, categoria: true, valor: true, unidade: true } }),
  ]);
  const referencia: ItemAvaliavel[] = [
    ...pendentes.map((p) => ({ categoria: p.categoria, valor: p.valor })),
    ...catalogo.map((c) => ({ categoria: c.categoria, valor: c.valor })),
  ];
  return { pendentes, catalogo, referencia };
});

/** Contagem de alertas de preço por motivo, alimenta o gráfico de discrepâncias do admin. */
export async function getResumoDiscrepancias(
  unidade?: Unidade,
): Promise<{ label: string; pendentes: number; catalogo: number }[]> {
  const [dePendentes, doCatalogo] = await Promise.all([
    getAlertasItensPendentes(),
    getAlertasCatalogo(),
  ]);
  const visivel = (a: AlertaDiscrepanciaView) => !unidade || a.unidade === unidade;
  const motivos: MotivoAlerta[] = ['preco_discrepante', 'preco_zero'];
  return motivos.map((m) => ({
    label: m,
    pendentes: dePendentes.filter((a) => visivel(a) && a.motivos.includes(m)).length,
    catalogo: doCatalogo.filter((a) => visivel(a) && a.motivos.includes(m)).length,
  }));
}

/** Alertas dos itens PENDENTES (tela da recepção), editáveis lá mesmo. */
export async function getAlertasItensPendentes(): Promise<AlertaDiscrepanciaView[]> {
  const { pendentes, referencia } = await carregarUniversoDePrecos();
  return pendentes.flatMap((p) => {
    const motivos = avaliarItem(p.valor, p.categoria, referencia);
    if (motivos.length === 0) return [];
    return [{
      itemId: p.id,
      nome: p.nome,
      categoria: p.categoria,
      unidade: p.unidade,
      valor: p.valor,
      aluno: p.aluno.nome,
      origem: 'pendente' as const,
      motivos,
    }];
  });
}

/** Alertas dos itens do CATÁLOGO em produção (tela do admin), editáveis na aba Itens. */
export async function getAlertasCatalogo(): Promise<AlertaDiscrepanciaView[]> {
  const { catalogo, referencia } = await carregarUniversoDePrecos();
  return catalogo.flatMap((c) => {
    const motivos = avaliarItem(c.valor, c.categoria, referencia);
    if (motivos.length === 0) return [];
    return [{
      itemId: c.id,
      nome: c.nome,
      categoria: c.categoria,
      unidade: c.unidade,
      valor: c.valor,
      aluno: null,
      origem: 'catalogo' as const,
      motivos,
    }];
  });
}

export interface TransacaoRecente {
  id: string;
  tipo: string;
  valor: number;
  createdAt: Date;
  usuarioNome: string;
  itemNome: string | null;
}

export async function getTransacoesRecentes(limit = 20, unidade?: Unidade): Promise<TransacaoRecente[]> {
  const linhas = await prisma.transacao.findMany({
    where: unidade ? { item: { unidade } } : {},
    orderBy: { createdAt: 'desc' },
    take: limit,
    select: {
      id: true,
      tipo: true,
      valor: true,
      createdAt: true,
      user: { select: { nome: true } },
      item: { select: { nome: true } },
    },
  });
  return linhas.map((t) => ({
    id: t.id,
    tipo: t.tipo,
    valor: t.valor,
    createdAt: t.createdAt,
    usuarioNome: t.user.nome,
    itemNome: t.item?.nome ?? null,
  }));
}
