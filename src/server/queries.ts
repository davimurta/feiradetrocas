import type { Papel, Unidade } from '@prisma/client';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { normalizarIdentificador } from '@/domain/auth';

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

export interface PedidoPendenteView {
  id: string;
  itemNome: string;
  valor: number;
  atendenteNome: string;
  unidade: Unidade;
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
      item: { select: { nome: true, unidade: true } },
      atendente: { select: { nome: true } },
    },
  });
  return linhas.map((p) => ({
    id: p.id,
    itemNome: p.item.nome,
    valor: p.valor,
    atendenteNome: p.atendente.nome,
    unidade: p.item.unidade,
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

export interface AdminMetrics {
  produtosDistintos: number;
  itensDisponiveis: number; // soma do estoque
  fichasEmCirculacao: number;
  totalTransacoes: number;
}

export async function getAdminMetrics(): Promise<AdminMetrics> {
  const [produtosDistintos, estoque, somaSaldo, totalTransacoes] = await Promise.all([
    prisma.item.count(),
    prisma.item.aggregate({ _sum: { quantidade: true } }),
    prisma.user.aggregate({ _sum: { saldo: true } }),
    prisma.transacao.count(),
  ]);
  return {
    produtosDistintos,
    itensDisponiveis: estoque._sum.quantidade ?? 0,
    fichasEmCirculacao: somaSaldo._sum.saldo ?? 0,
    totalTransacoes,
  };
}

export interface AdminDashboard {
  fichasEmCirculacao: number;
  itensEmEstoque: number;
  produtosDistintos: number;
  totalTransacoes: number;
  totalUsuarios: number;
  totalAlunos: number;
  volumeCreditos: number;
  volumeDebitos: number;
  itensPorCategoria: { label: string; value: number }[];
  estoquePorUnidade: { label: string; value: number }[];
  transacoesPorDia: { label: string; value: number }[];
}

export async function getAdminDashboard(unidade?: Unidade): Promise<AdminDashboard> {
  // Filtros por unidade (undefined = ambas). Transações herdam a unidade do item.
  const userWhere = unidade ? { unidade } : {};
  const itemWhere = unidade ? { unidade } : {};
  const transWhere = unidade ? { item: { unidade } } : {};

  const [
    somaSaldo,
    estoque,
    produtosDistintos,
    totalTransacoes,
    totalUsuarios,
    totalAlunos,
    porTipo,
    porCategoria,
    porUnidade,
    porDiaRaw,
  ] = await Promise.all([
    prisma.user.aggregate({ _sum: { saldo: true }, where: userWhere }),
    prisma.item.aggregate({ _sum: { quantidade: true }, where: itemWhere }),
    prisma.item.count({ where: itemWhere }),
    prisma.transacao.count({ where: transWhere }),
    prisma.user.count({ where: userWhere }),
    prisma.user.count({ where: { ...userWhere, papel: 'participante' } }),
    prisma.transacao.groupBy({ by: ['tipo'], _sum: { valor: true }, where: transWhere }),
    prisma.item.groupBy({ by: ['categoria'], _sum: { quantidade: true }, where: itemWhere }),
    prisma.item.groupBy({ by: ['unidade'], _sum: { quantidade: true }, where: itemWhere }),
    prisma.$queryRaw<{ dia: string; total: number }[]>(
      unidade
        ? Prisma.sql`
            SELECT to_char(date_trunc('day', t.created_at), 'YYYY-MM-DD') AS dia, count(*)::int AS total
            FROM transacoes t JOIN items i ON i.id = t.item_id
            WHERE t.created_at >= now() - interval '6 days' AND i.unidade = ${unidade}::"Unidade"
            GROUP BY 1 ORDER BY 1`
        : Prisma.sql`
            SELECT to_char(date_trunc('day', created_at), 'YYYY-MM-DD') AS dia, count(*)::int AS total
            FROM transacoes
            WHERE created_at >= now() - interval '6 days'
            GROUP BY 1 ORDER BY 1`,
    ),
  ]);

  const volume = (tipo: string) =>
    porTipo.find((t) => t.tipo === tipo)?._sum.valor ?? 0;

  const mapaDias = new Map(porDiaRaw.map((r) => [r.dia, r.total]));
  const transacoesPorDia: { label: string; value: number }[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const iso = d.toISOString().slice(0, 10);
    const label = `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
    transacoesPorDia.push({ label, value: mapaDias.get(iso) ?? 0 });
  }

  return {
    fichasEmCirculacao: somaSaldo._sum.saldo ?? 0,
    itensEmEstoque: estoque._sum.quantidade ?? 0,
    produtosDistintos,
    totalTransacoes,
    totalUsuarios,
    totalAlunos,
    volumeCreditos: volume('credito_entrada'),
    volumeDebitos: Math.abs(volume('debito_compra')),
    itensPorCategoria: porCategoria
      .map((c) => ({ label: c.categoria, value: c._sum.quantidade ?? 0 }))
      .sort((a, b) => b.value - a.value),
    estoquePorUnidade: porUnidade
      .map((u) => ({ label: u.unidade, value: u._sum.quantidade ?? 0 }))
      .sort((a, b) => b.value - a.value),
    transacoesPorDia,
  };
}

export interface ItemAdmin {
  id: string;
  codigo: string;
  nome: string;
  categoria: string;
  valor: number;
  quantidade: number;
  unidade: Unidade;
}

export function listarItensAdmin(busca?: string, unidade?: Unidade): Promise<ItemAdmin[]> {
  const q = busca?.trim();
  return prisma.item.findMany({
    where: {
      ...(unidade ? { unidade } : {}),
      ...(q ? { OR: [{ nome: { contains: q, mode: 'insensitive' } }, { categoria: { contains: q, mode: 'insensitive' } }] } : {}),
    },
    orderBy: [{ unidade: 'asc' }, { nome: 'asc' }],
    select: { id: true, codigo: true, nome: true, categoria: true, valor: true, quantidade: true, unidade: true },
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
