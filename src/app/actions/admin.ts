'use server';

import { z } from 'zod';
import { Papel, Unidade, Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { getCurrentUser, assertPapel } from '@/lib/auth';
import { DomainError } from '@/lib/errors';
import { ajustarSaldo } from '@/domain/admin';
import { definirBloqueio } from '@/domain/reporte';
import {
  listarItensAdmin,
  listarUsuariosAdmin,
  getTransacoesRecentes,
  listarReportes,
  getAlertasCatalogo,
  type ItemAdmin,
  type UsuarioAdmin,
  type TransacaoRecente,
  type ReporteView,
  type AlertaDiscrepanciaView,
} from '@/server/queries';
import { getMetricas, type MetricasView } from '@/server/metricas';
import { filtroMetricasSchema, resolverFiltro } from '@/lib/filtroMetricas';
import { ok, fail, type ActionResult } from './_result';

async function exigirAdmin() {
  const user = await getCurrentUser();
  return assertPapel(user, Papel.admin);
}

const buscaSchema = z.object({
  busca: z.string().trim().max(80).optional(),
  unidade: z.nativeEnum(Unidade).optional(),
});

export async function metricasAction(
  input: z.input<typeof filtroMetricasSchema> = {},
): Promise<ActionResult<{ metricas: MetricasView; recentes: TransacaoRecente[] }>> {
  try {
    await exigirAdmin();
    const filtro = resolverFiltro(filtroMetricasSchema.parse(input));
    const [metricas, recentes] = await Promise.all([
      getMetricas(filtro),
      getTransacoesRecentes(20, filtro.unidade),
    ]);
    return ok({ metricas, recentes });
  } catch (err) {
    return fail(err);
  }
}

export async function listarItensAction(
  input: z.input<typeof buscaSchema>,
): Promise<ActionResult<ItemAdmin[]>> {
  try {
    await exigirAdmin();
    const { busca, unidade } = buscaSchema.parse(input);
    return ok(await listarItensAdmin(busca, unidade));
  } catch (err) {
    return fail(err);
  }
}

export async function alertasCatalogoAction(): Promise<ActionResult<AlertaDiscrepanciaView[]>> {
  try {
    await exigirAdmin();
    return ok(await getAlertasCatalogo());
  } catch (err) {
    return fail(err);
  }
}

const editarItemSchema = z.object({
  id: z.string().min(1),
  nome: z.string().trim().min(1, 'Nome obrigatório.').max(120),
  categoria: z.string().trim().min(1, 'Categoria obrigatória.').max(60),
  valor: z.number().int().positive('Valor deve ser positivo.'),
  quantidade: z.number().int().min(0, 'Quantidade não pode ser negativa.'),
  descricao: z.string().trim().max(500).optional(),
  unidade: z.nativeEnum(Unidade),
});

export async function editarItemAction(
  input: z.input<typeof editarItemSchema>,
): Promise<ActionResult<ItemAdmin>> {
  try {
    await exigirAdmin();
    const { id, descricao, ...dados } = editarItemSchema.parse(input);
    const item = await prisma.item.update({
      where: { id },
      data: { ...dados, descricao: descricao ?? null },
      select: { id: true, codigo: true, nome: true, categoria: true, valor: true, quantidade: true, unidade: true, descricao: true },
    });
    return ok(item);
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      return fail(new DomainError('CODIGO_DUPLICADO', 'Já existe um item com esse nome e valor.'));
    }
    return fail(err);
  }
}

const idSchema = z.object({ id: z.string().min(1) });

export async function excluirItemAction(
  input: z.input<typeof idSchema>,
): Promise<ActionResult<{ id: string }>> {
  try {
    await exigirAdmin();
    const { id } = idSchema.parse(input);
    await prisma.item.delete({ where: { id } });
    return ok({ id });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2003') {
      return fail(new DomainError('ITEM_INDISPONIVEL', 'Item tem histórico de transações e não pode ser excluído. Zere o estoque.'));
    }
    return fail(err);
  }
}

export async function listarUsuariosAction(
  input: z.input<typeof buscaSchema>,
): Promise<ActionResult<UsuarioAdmin[]>> {
  try {
    await exigirAdmin();
    const { busca, unidade } = buscaSchema.parse(input);
    return ok(await listarUsuariosAdmin(busca, unidade));
  } catch (err) {
    return fail(err);
  }
}

const editarUsuarioSchema = z.object({
  id: z.string().min(1),
  nome: z.string().trim().min(1, 'Nome obrigatório.').max(120),
  papel: z.nativeEnum(Papel),
  unidade: z.nativeEnum(Unidade),
});

export async function editarUsuarioAction(
  input: z.input<typeof editarUsuarioSchema>,
): Promise<ActionResult<UsuarioAdmin>> {
  try {
    await exigirAdmin();
    const { id, ...dados } = editarUsuarioSchema.parse(input);
    const user = await prisma.user.update({
      where: { id },
      data: { ...dados, pendente: false, sessionVersion: { increment: 1 } },
      select: { id: true, nome: true, email: true, papel: true, unidade: true, saldo: true, codigoCarteira: true, pendente: true },
    });
    return ok(user);
  } catch (err) {
    return fail(err);
  }
}

export async function listarReportesAction(): Promise<ActionResult<ReporteView[]>> {
  try {
    await exigirAdmin();
    return ok(await listarReportes());
  } catch (err) {
    return fail(err);
  }
}

const bloquearSchema = z.object({ id: z.string().min(1), bloqueado: z.boolean() });

export async function bloquearContaAction(
  input: z.input<typeof bloquearSchema>,
): Promise<ActionResult<{ id: string; bloqueado: boolean }>> {
  try {
    await exigirAdmin();
    const { id, bloqueado } = bloquearSchema.parse(input);
    return ok(await definirBloqueio(prisma, { userId: id, bloqueado }));
  } catch (err) {
    return fail(err);
  }
}

const ajustarSaldoSchema = z.object({
  id: z.string().min(1),
  novoSaldo: z.number().int().min(0, 'Saldo não pode ser negativo.'),
});

export async function ajustarSaldoAction(
  input: z.input<typeof ajustarSaldoSchema>,
): Promise<ActionResult<{ saldoAtual: number; delta: number }>> {
  try {
    const admin = await exigirAdmin();
    const { id, novoSaldo } = ajustarSaldoSchema.parse(input);
    return ok(await ajustarSaldo(prisma, { userId: id, novoSaldo, atendenteId: admin.id }));
  } catch (err) {
    return fail(err);
  }
}
