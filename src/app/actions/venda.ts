'use server';

import { z } from 'zod';
import { Papel } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { getCurrentUser, assertPapel } from '@/lib/auth';
import { DomainError } from '@/lib/errors';
import { criarPedido, cancelarPedido, type CriarPedidoResult } from '@/domain/pedido';
import {
  getCatalogo,
  buscarAlunoPorIdentificador,
  consultarPedido,
  type ProdutoView,
  type AlunoView,
  type PedidoStatusView,
} from '@/server/queries';
import { ok, fail, type ActionResult } from './_result';

const PAPEIS = [Papel.atendente_stand, Papel.admin] as const;

const criarSchema = z.object({
  itemId: z.string().min(1, 'Escolha um item do catálogo.'),
  codigoCarteira: z.string().trim().min(1, 'Informe a carteira do comprador.'),
});

export async function criarPedidoAction(
  input: z.input<typeof criarSchema>,
): Promise<ActionResult<CriarPedidoResult>> {
  try {
    const user = await getCurrentUser();
    const atendente = assertPapel(user, ...PAPEIS);
    const dados = criarSchema.parse(input);

    const comprador = await buscarAlunoPorIdentificador(dados.codigoCarteira);
    if (!comprador) throw new DomainError('CARTEIRA_INEXISTENTE', 'Comprador não encontrado.');

    return ok(
      await criarPedido(prisma, {
        itemId: dados.itemId,
        compradorId: comprador.id,
        atendenteId: atendente.id,
        unidade: atendente.unidade,
      }),
    );
  } catch (err) {
    return fail(err);
  }
}

const pedidoIdSchema = z.object({ pedidoId: z.string().min(1) });

export async function consultarPedidoAction(
  input: z.input<typeof pedidoIdSchema>,
): Promise<ActionResult<PedidoStatusView>> {
  try {
    const user = await getCurrentUser();
    assertPapel(user, ...PAPEIS);
    const { pedidoId } = pedidoIdSchema.parse(input);
    const p = await consultarPedido(pedidoId);
    if (!p) throw new DomainError('PEDIDO_INEXISTENTE', 'Pedido não encontrado.');
    return ok(p);
  } catch (err) {
    return fail(err);
  }
}

export async function cancelarPedidoAction(
  input: z.input<typeof pedidoIdSchema>,
): Promise<ActionResult<{ ok: true }>> {
  try {
    const user = await getCurrentUser();
    const atendente = assertPapel(user, ...PAPEIS);
    const { pedidoId } = pedidoIdSchema.parse(input);
    await cancelarPedido(prisma, { pedidoId, atendenteId: atendente.id });
    return ok({ ok: true });
  } catch (err) {
    return fail(err);
  }
}

const buscaSchema = z.object({ busca: z.string().trim().optional() });

export async function buscarCatalogoStandAction(
  input: z.input<typeof buscaSchema>,
): Promise<ActionResult<ProdutoView[]>> {
  try {
    const user = await getCurrentUser();
    const atendente = assertPapel(user, ...PAPEIS);
    const { busca } = buscaSchema.parse(input);
    return ok(await getCatalogo(atendente.unidade, busca));
  } catch (err) {
    return fail(err);
  }
}

const carteiraSchema = z.object({ codigo: z.string().trim().min(1, 'Informe a carteira/matrícula.') });

export async function buscarCompradorAction(
  input: z.input<typeof carteiraSchema>,
): Promise<ActionResult<AlunoView>> {
  try {
    const user = await getCurrentUser();
    assertPapel(user, ...PAPEIS);
    const { codigo } = carteiraSchema.parse(input);
    const aluno = await buscarAlunoPorIdentificador(codigo);
    if (!aluno) throw new DomainError('CARTEIRA_INEXISTENTE', `Comprador não encontrado: ${codigo}.`);
    return ok(aluno);
  } catch (err) {
    return fail(err);
  }
}
