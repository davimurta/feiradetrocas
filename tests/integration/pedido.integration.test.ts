import { it, expect } from 'vitest';
import { Papel } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { criarPedido, aprovarPedido, recusarPedido, cancelarPedido } from '@/domain/pedido';
import { describeDb } from '../helpers/db';
import { criarUsuario, criarItem, criarAtendente } from '../helpers/factories';

async function cenario(saldo: number, valor: number, quantidade: number, unidade: 'barroca' | 'floresta' = 'barroca') {
  const atendente = await criarAtendente(Papel.atendente_stand, unidade);
  const comprador = await criarUsuario({ saldo });
  const item = await criarItem({ valor, quantidade, unidade });
  return { atendente, comprador, item };
}

describeDb('Pedido / aprovação em duas pontas (integração)', () => {
  it('fluxo feliz: criar pendente → comprador aprova → finaliza (débito + baixa + auditoria)', async () => {
    const { atendente, comprador, item } = await cenario(100, 30, 3);

    const pedido = await criarPedido(prisma, { itemId: item.id, compradorId: comprador.id, atendenteId: atendente.id, unidade: 'barroca' });
    // Nada mudou ainda (pendente).
    expect((await prisma.item.findUniqueOrThrow({ where: { id: item.id } })).quantidade).toBe(3);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: comprador.id } })).saldo).toBe(100);
    expect((await prisma.pedido.findUniqueOrThrow({ where: { id: pedido.pedidoId } })).status).toBe('pendente');

    const res = await aprovarPedido(prisma, { pedidoId: pedido.pedidoId, compradorId: comprador.id });
    expect(res).toMatchObject({ saldoAtual: 70, restante: 2 });

    const p = await prisma.pedido.findUniqueOrThrow({ where: { id: pedido.pedidoId } });
    expect(p.status).toBe('aprovado');
    expect(p.transacaoId).toBeTruthy();
    expect((await prisma.user.findUniqueOrThrow({ where: { id: comprador.id } })).saldo).toBe(70);
    expect(await prisma.transacao.count({ where: { tipo: 'debito_compra' } })).toBe(1);
  });

  it('comprador recusa: nada é debitado e estoque intacto', async () => {
    const { atendente, comprador, item } = await cenario(100, 30, 2);
    const pedido = await criarPedido(prisma, { itemId: item.id, compradorId: comprador.id, atendenteId: atendente.id, unidade: 'barroca' });
    await recusarPedido(prisma, { pedidoId: pedido.pedidoId, compradorId: comprador.id });

    expect((await prisma.pedido.findUniqueOrThrow({ where: { id: pedido.pedidoId } })).status).toBe('recusado');
    expect((await prisma.item.findUniqueOrThrow({ where: { id: item.id } })).quantidade).toBe(2);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: comprador.id } })).saldo).toBe(100);
  });

  it('atendente cancela pedido pendente', async () => {
    const { atendente, comprador, item } = await cenario(100, 30, 2);
    const pedido = await criarPedido(prisma, { itemId: item.id, compradorId: comprador.id, atendenteId: atendente.id, unidade: 'barroca' });
    await cancelarPedido(prisma, { pedidoId: pedido.pedidoId, atendenteId: atendente.id });
    expect((await prisma.pedido.findUniqueOrThrow({ where: { id: pedido.pedidoId } })).status).toBe('cancelado');
  });

  it('item de outra unidade → ITEM_INEXISTENTE no criar', async () => {
    const atendente = await criarAtendente(Papel.atendente_stand, 'barroca');
    const comprador = await criarUsuario({ saldo: 100 });
    const item = await criarItem({ valor: 10, quantidade: 2, unidade: 'floresta' });
    await expect(
      criarPedido(prisma, { itemId: item.id, compradorId: comprador.id, atendenteId: atendente.id, unidade: 'barroca' }),
    ).rejects.toMatchObject({ code: 'ITEM_INEXISTENTE' });
  });

  it('saldo insuficiente na aprovação → SALDO_INSUFICIENTE e pedido recusado', async () => {
    const { atendente, comprador, item } = await cenario(5, 30, 2);
    const pedido = await criarPedido(prisma, { itemId: item.id, compradorId: comprador.id, atendenteId: atendente.id, unidade: 'barroca' });
    await expect(
      aprovarPedido(prisma, { pedidoId: pedido.pedidoId, compradorId: comprador.id }),
    ).rejects.toMatchObject({ code: 'SALDO_INSUFICIENTE' });

    expect((await prisma.pedido.findUniqueOrThrow({ where: { id: pedido.pedidoId } })).status).toBe('recusado');
    expect((await prisma.item.findUniqueOrThrow({ where: { id: item.id } })).quantidade).toBe(2);
  });

  it('corrida na última unidade: 2 aprovações simultâneas → só 1 finaliza', async () => {
    const atendente = await criarAtendente(Papel.atendente_stand, 'barroca');
    const c1 = await criarUsuario({ saldo: 100 });
    const c2 = await criarUsuario({ saldo: 100 });
    const item = await criarItem({ valor: 30, quantidade: 1 });

    const p1 = await criarPedido(prisma, { itemId: item.id, compradorId: c1.id, atendenteId: atendente.id, unidade: 'barroca' });
    const p2 = await criarPedido(prisma, { itemId: item.id, compradorId: c2.id, atendenteId: atendente.id, unidade: 'barroca' });

    const [a, b] = await Promise.allSettled([
      aprovarPedido(prisma, { pedidoId: p1.pedidoId, compradorId: c1.id }),
      aprovarPedido(prisma, { pedidoId: p2.pedidoId, compradorId: c2.id }),
    ]);

    const vitorias = [a, b].filter((r) => r.status === 'fulfilled');
    expect(vitorias).toHaveLength(1);
    expect((([a, b].find((r) => r.status === 'rejected')) as PromiseRejectedResult).reason).toMatchObject({ code: 'ITEM_INDISPONIVEL' });

    expect((await prisma.item.findUniqueOrThrow({ where: { id: item.id } })).quantidade).toBe(0);
    expect(await prisma.transacao.count({ where: { tipo: 'debito_compra' } })).toBe(1);
  });
});
