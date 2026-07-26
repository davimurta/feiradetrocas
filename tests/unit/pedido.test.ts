import { describe, it, expect, beforeEach } from 'vitest';
import { criarPedido, aprovarPedido } from '@/domain/pedido';
import { makeMockDb } from './_mock-db';

describe('criarPedido (unitário, Prisma mockado)', () => {
  let mock: ReturnType<typeof makeMockDb>;
  beforeEach(() => {
    mock = makeMockDb();
  });
  const input = { itemId: 'i1', compradorId: 'c1', atendenteId: 'a1', unidade: 'barroca' as const };

  it('cria pedido pendente com dados do item e comprador', async () => {
    const { db, tx } = mock;
    tx.item.findUnique.mockResolvedValue({ id: 'i1', valor: 10, nome: 'Livro', quantidade: 3, unidade: 'barroca' });
    tx.user.findUnique.mockResolvedValue({ id: 'c1', nome: 'Ana', saldo: 20 });
    tx.pedido.create.mockResolvedValue({ id: 'p1' });

    const res = await criarPedido(db, input);
    expect(res).toEqual({ pedidoId: 'p1', itemNome: 'Livro', valor: 10, compradorNome: 'Ana', compradorSaldo: 20, suficiente: true });
  });

  it('item de outra unidade → ITEM_INEXISTENTE', async () => {
    const { db, tx } = mock;
    tx.item.findUnique.mockResolvedValue({ id: 'i1', valor: 10, nome: 'Livro', quantidade: 3, unidade: 'floresta' });
    await expect(criarPedido(db, input)).rejects.toMatchObject({ code: 'ITEM_INEXISTENTE' });
  });

  it('item esgotado → ITEM_INDISPONIVEL', async () => {
    const { db, tx } = mock;
    tx.item.findUnique.mockResolvedValue({ id: 'i1', valor: 10, nome: 'Livro', quantidade: 0, unidade: 'barroca' });
    await expect(criarPedido(db, input)).rejects.toMatchObject({ code: 'ITEM_INDISPONIVEL' });
  });

  it('comprador inexistente → CARTEIRA_INEXISTENTE', async () => {
    const { db, tx } = mock;
    tx.item.findUnique.mockResolvedValue({ id: 'i1', valor: 10, nome: 'Livro', quantidade: 3, unidade: 'barroca' });
    tx.user.findUnique.mockResolvedValue(null);
    await expect(criarPedido(db, input)).rejects.toMatchObject({ code: 'CARTEIRA_INEXISTENTE' });
  });
});

describe('aprovarPedido (unitário, Prisma mockado)', () => {
  let mock: ReturnType<typeof makeMockDb>;
  beforeEach(() => {
    mock = makeMockDb();
  });
  const input = { pedidoId: 'p1', compradorId: 'c1' };

  function armarPedido(status = 'pendente') {
    mock.tx.pedido.findUnique.mockResolvedValue({
      id: 'p1',
      status,
      compradorId: 'c1',
      itemId: 'i1',
      valor: 10,
      item: { nome: 'Livro' },
    });
  }

  it('aprovação finaliza: baixa estoque, debita e retorna saldo/restante', async () => {
    const { db, tx } = mock;
    armarPedido();
    tx.pedido.updateMany.mockResolvedValue({ count: 1 });
    tx.item.updateMany.mockResolvedValue({ count: 1 });
    tx.user.updateMany.mockResolvedValue({ count: 1 });
    tx.transacao.create.mockResolvedValue({ id: 't1' });
    tx.pedido.update.mockResolvedValue({});
    tx.user.findUniqueOrThrow.mockResolvedValue({ saldo: 90 });
    tx.item.findUniqueOrThrow.mockResolvedValue({ quantidade: 2 });

    const res = await aprovarPedido(db, input);
    expect(res).toEqual({ saldoAtual: 90, restante: 2, valor: 10, itemNome: 'Livro' });
  });

  it('pedido de outro comprador → NAO_AUTORIZADO', async () => {
    const { db } = mock;
    mock.tx.pedido.findUnique.mockResolvedValue({ id: 'p1', status: 'pendente', compradorId: 'outro', itemId: 'i1', valor: 10, item: { nome: 'X' } });
    await expect(aprovarPedido(db, input)).rejects.toMatchObject({ code: 'NAO_AUTORIZADO' });
  });

  it('pedido não pendente → PEDIDO_NAO_PENDENTE', async () => {
    const { db } = mock;
    armarPedido('aprovado');
    await expect(aprovarPedido(db, input)).rejects.toMatchObject({ code: 'PEDIDO_NAO_PENDENTE' });
  });

  it('esgotado na finalização → ITEM_INDISPONIVEL (e não grava transação)', async () => {
    const { db, tx } = mock;
    armarPedido();
    tx.pedido.updateMany.mockResolvedValue({ count: 1 });
    tx.item.updateMany.mockResolvedValue({ count: 0 });
    await expect(aprovarPedido(db, input)).rejects.toMatchObject({ code: 'ITEM_INDISPONIVEL' });
    expect(tx.transacao.create).not.toHaveBeenCalled();
  });

  it('saldo insuficiente na finalização → SALDO_INSUFICIENTE', async () => {
    const { db, tx } = mock;
    armarPedido();
    tx.pedido.updateMany.mockResolvedValue({ count: 1 });
    tx.item.updateMany.mockResolvedValue({ count: 1 });
    tx.user.updateMany.mockResolvedValue({ count: 0 });
    await expect(aprovarPedido(db, input)).rejects.toMatchObject({ code: 'SALDO_INSUFICIENTE' });
    expect(tx.transacao.create).not.toHaveBeenCalled();
  });

  it('pedido inexistente → PEDIDO_INEXISTENTE', async () => {
    const { db } = mock;
    mock.tx.pedido.findUnique.mockResolvedValue(null);
    await expect(aprovarPedido(db, input)).rejects.toMatchObject({ code: 'PEDIDO_INEXISTENTE' });
  });
});
