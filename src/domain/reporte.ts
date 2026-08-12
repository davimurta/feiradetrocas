import type { PrismaClient } from '@prisma/client';
import { DomainError } from '@/lib/errors';

type Db = PrismaClient;

export interface CriarReporteResult {
  id: string;
  reportadoNome: string;
}

/**
 * Registra um reporte do stand contra o comprador de um pedido (ex.: recusa indevida, furto).
 * O denunciado é derivado do próprio pedido: o stand não escolhe quem denunciar à mão.
 */
export async function criarReporte(
  db: Db,
  input: { pedidoId: string; reportanteId: string; motivo: string; descricao?: string },
): Promise<CriarReporteResult> {
  const pedido = await db.pedido.findUnique({
    where: { id: input.pedidoId },
    select: { id: true, comprador: { select: { id: true, nome: true } } },
  });
  if (!pedido) throw new DomainError('PEDIDO_INEXISTENTE', 'Pedido não encontrado.');

  const reporte = await db.reporte.create({
    data: {
      reportadoId: pedido.comprador.id,
      reportanteId: input.reportanteId,
      pedidoId: pedido.id,
      motivo: input.motivo.trim(),
      descricao: input.descricao?.trim() || null,
    },
    select: { id: true },
  });
  return { id: reporte.id, reportadoNome: pedido.comprador.nome };
}

export async function definirBloqueio(
  db: Db,
  input: { userId: string; bloqueado: boolean },
): Promise<{ id: string; bloqueado: boolean }> {
  const user = await db.user
    .update({
      where: { id: input.userId },
      data: {
        bloqueado: input.bloqueado,
        ...(input.bloqueado ? { sessionVersion: { increment: 1 } } : {}),
      },
      select: { id: true, bloqueado: true },
    })
    .catch(() => null);
  if (!user) throw new DomainError('ALUNO_INEXISTENTE', 'Usuário não encontrado.');
  return user;
}
