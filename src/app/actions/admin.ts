'use server';

import { z } from 'zod';
import { Papel, Unidade, Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { getCurrentUser, assertPapel } from '@/lib/auth';
import { DomainError } from '@/lib/errors';
import { ajustarSaldo } from '@/domain/admin';
import {
  listarItensAdmin,
  listarUsuariosAdmin,
  getAdminDashboard,
  getTransacoesRecentes,
  type ItemAdmin,
  type UsuarioAdmin,
  type AdminDashboard,
  type TransacaoRecente,
} from '@/server/queries';
import { ok, fail, type ActionResult } from './_result';

async function exigirAdmin() {
  const user = await getCurrentUser();
  return assertPapel(user, Papel.admin);
}

const buscaSchema = z.object({
  busca: z.string().trim().optional(),
  unidade: z.nativeEnum(Unidade).optional(),
});

/** Painel (métricas + gráficos + recentes), filtrável por unidade (undefined = ambas). */
export async function dashboardAction(
  input: { unidade?: Unidade } = {},
): Promise<ActionResult<{ dashboard: AdminDashboard; recentes: TransacaoRecente[] }>> {
  try {
    await exigirAdmin();
    const unidade = input.unidade;
    const [dashboard, recentes] = await Promise.all([
      getAdminDashboard(unidade),
      getTransacoesRecentes(20, unidade),
    ]);
    return ok({ dashboard, recentes });
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

const editarItemSchema = z.object({
  id: z.string().min(1),
  nome: z.string().trim().min(1, 'Nome obrigatório.').max(120),
  categoria: z.string().trim().min(1, 'Categoria obrigatória.').max(60),
  valor: z.number().int().positive('Valor deve ser positivo.'),
  quantidade: z.number().int().min(0, 'Quantidade não pode ser negativa.'),
  unidade: z.nativeEnum(Unidade),
});

export async function editarItemAction(
  input: z.input<typeof editarItemSchema>,
): Promise<ActionResult<ItemAdmin>> {
  try {
    await exigirAdmin();
    const { id, ...dados } = editarItemSchema.parse(input);
    const item = await prisma.item.update({
      where: { id },
      data: dados,
      select: { id: true, codigo: true, nome: true, categoria: true, valor: true, quantidade: true, unidade: true },
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
      return fail(new DomainError('ITEM_INDISPONIVEL', 'Item tem histórico de transações — não pode ser excluído. Zere o estoque.'));
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
      data: { ...dados, pendente: false },
      select: { id: true, nome: true, email: true, papel: true, unidade: true, saldo: true, codigoCarteira: true, pendente: true },
    });
    return ok(user);
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
