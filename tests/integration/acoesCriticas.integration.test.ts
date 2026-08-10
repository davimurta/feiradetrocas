import { it, expect } from 'vitest';
import { prisma } from '@/lib/prisma';
import {
  getPreviaAcoesCriticas,
  zerarTodosOsSaldos,
  creditarEmLote,
  moverItensDeUnidade,
  cancelarPedidosPendentes,
  desbloquearTodasAsContas,
} from '@/domain/acoesCriticas';
import { criarPedido } from '@/domain/pedido';
import { describeDb } from '../helpers/db';
import { criarUsuario, criarAtendente, criarItem } from '../helpers/factories';

describeDb('Ações críticas do admin (integração, Postgres real)', () => {
  it('zerar saldos apaga o saldo e deixa o estorno no extrato', async () => {
    const admin = await criarAtendente('admin');
    const a = await criarUsuario({ saldo: 30 });
    const b = await criarUsuario({ saldo: 12 });
    const semSaldo = await criarUsuario({ saldo: 0 });

    const r = await zerarTodosOsSaldos(prisma, { adminId: admin.id, apenasParticipantes: true });

    expect(r).toEqual({ contasAfetadas: 2, fichas: 42 });
    expect((await prisma.user.findUniqueOrThrow({ where: { id: a.id } })).saldo).toBe(0);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: b.id } })).saldo).toBe(0);

    const estorno = await prisma.transacao.findFirstOrThrow({ where: { userId: a.id } });
    expect(estorno).toMatchObject({ tipo: 'ajuste_manual', valor: -30, atendenteId: admin.id });

    expect(await prisma.transacao.count({ where: { userId: semSaldo.id } })).toBe(0);
  });

  it('zerar com apenasParticipantes=false alcança atendentes também', async () => {
    const admin = await criarAtendente('admin');
    const atendente = await criarAtendente('atendente_stand');
    await prisma.user.update({ where: { id: atendente.id }, data: { saldo: 7 } });

    const r = await zerarTodosOsSaldos(prisma, { adminId: admin.id, apenasParticipantes: false });

    expect(r.contasAfetadas).toBe(1);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: atendente.id } })).saldo).toBe(0);
  });

  it('creditar em lote soma a todos e audita cada conta', async () => {
    const admin = await criarAtendente('admin');
    const a = await criarUsuario({ saldo: 5 });
    const b = await criarUsuario({ saldo: 0 });

    const r = await creditarEmLote(prisma, {
      adminId: admin.id,
      valor: 100,
      apenasParticipantes: true,
    });

    expect(r).toEqual({ contasAfetadas: 2, fichas: 200 });
    expect((await prisma.user.findUniqueOrThrow({ where: { id: a.id } })).saldo).toBe(105);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: b.id } })).saldo).toBe(100);
    expect(await prisma.transacao.count({ where: { tipo: 'ajuste_manual', valor: 100 } })).toBe(2);
  });

  it('creditar recusa valor não positivo', async () => {
    const admin = await criarAtendente('admin');
    await expect(
      creditarEmLote(prisma, { adminId: admin.id, valor: 0, apenasParticipantes: true }),
    ).rejects.toMatchObject({ code: 'VALOR_INVALIDO' });
  });

  it('mover itens troca a unidade e soma quantidade quando já existe igual no destino', async () => {
    const soNaOrigem = await criarItem({
      nome: 'Régua',
      valor: 3,
      quantidade: 4,
      unidade: 'barroca',
    });
    const duplicadoOrigem = await criarItem({
      nome: 'Caneca',
      valor: 5,
      quantidade: 2,
      unidade: 'barroca',
    });
    const duplicadoDestino = await criarItem({
      nome: 'Caneca',
      valor: 5,
      quantidade: 3,
      unidade: 'floresta',
    });

    const r = await moverItensDeUnidade(prisma, { de: 'barroca', para: 'floresta' });

    expect(r).toMatchObject({ movidos: 1, mesclados: 1, pecas: 6 });

    const regua = await prisma.item.findUniqueOrThrow({ where: { id: soNaOrigem.id } });
    expect(regua.unidade).toBe('floresta');
    expect(regua.quantidade).toBe(4);

    const destino = await prisma.item.findUniqueOrThrow({ where: { id: duplicadoDestino.id } });
    expect(destino.quantidade).toBe(5);

    const origem = await prisma.item.findUniqueOrThrow({ where: { id: duplicadoOrigem.id } });
    expect(origem.quantidade).toBe(0);
    expect(origem.unidade).toBe('barroca');
  });

  it('mover itens preserva o histórico de quem já vendeu o item mesclado', async () => {
    const comprador = await criarUsuario({ saldo: 50 });
    const stand = await criarAtendente('atendente_stand');
    const item = await criarItem({ nome: 'Caneca', valor: 5, quantidade: 2, unidade: 'barroca' });
    await criarItem({ nome: 'Caneca', valor: 5, quantidade: 1, unidade: 'floresta' });

    const pedido = await criarPedido(prisma, {
      itemId: item.id,
      compradorId: comprador.id,
      atendenteId: stand.id,
      unidade: 'barroca',
    });

    await moverItensDeUnidade(prisma, { de: 'barroca', para: 'floresta' });

    const noBanco = await prisma.pedido.findUniqueOrThrow({ where: { id: pedido.pedidoId } });
    expect(noBanco.itemId).toBe(item.id);
    expect(await prisma.item.count({ where: { id: item.id } })).toBe(1);
  });

  it('mover recusa origem igual ao destino', async () => {
    await expect(
      moverItensDeUnidade(prisma, { de: 'barroca', para: 'barroca' }),
    ).rejects.toMatchObject({ code: 'VALOR_INVALIDO' });
  });

  it('cancelar pedidos pendentes registra o motivo e não mexe em saldo', async () => {
    const comprador = await criarUsuario({ saldo: 40 });
    const stand = await criarAtendente('atendente_stand');
    const item = await criarItem({ valor: 8, quantidade: 5 });
    await criarPedido(prisma, {
      itemId: item.id,
      compradorId: comprador.id,
      atendenteId: stand.id,
      unidade: 'barroca',
    });

    const r = await cancelarPedidosPendentes(prisma, { motivo: 'Fim do evento' });

    expect(r.cancelados).toBe(1);
    const pedido = await prisma.pedido.findFirstOrThrow({ where: { compradorId: comprador.id } });
    expect(pedido).toMatchObject({ status: 'cancelado', motivoRecusa: 'Fim do evento' });
    expect((await prisma.user.findUniqueOrThrow({ where: { id: comprador.id } })).saldo).toBe(40);
    expect((await prisma.item.findUniqueOrThrow({ where: { id: item.id } })).quantidade).toBe(5);
  });

  it('desbloquear libera só quem estava bloqueado', async () => {
    const bloqueado = await criarUsuario();
    await prisma.user.update({ where: { id: bloqueado.id }, data: { bloqueado: true } });
    await criarUsuario();

    const r = await desbloquearTodasAsContas(prisma);

    expect(r.desbloqueadas).toBe(1);
    expect(await prisma.user.count({ where: { bloqueado: true } })).toBe(0);
  });

  it('a prévia mostra o impacto antes de executar', async () => {
    await criarUsuario({ saldo: 20 });
    await criarUsuario({ saldo: 0 });
    await criarItem({ quantidade: 3, unidade: 'barroca' });

    const p = await getPreviaAcoesCriticas(prisma);

    expect(p.participantes).toBe(2);
    expect(p.contasComSaldo).toBe(1);
    expect(p.fichasEmCirculacao).toBe(20);
    expect(p.estoquePorUnidade.find((e) => e.unidade === 'barroca')).toMatchObject({
      produtos: 1,
      pecas: 3,
    });
  });
});
