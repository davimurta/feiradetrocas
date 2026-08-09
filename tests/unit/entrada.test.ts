import { describe, it, expect, beforeEach } from 'vitest';
import { Prisma } from '@prisma/client';
import { registrarEntrada, colocarEmProducao, editarItemPendente } from '@/domain/entrada';
import { DomainError } from '@/lib/errors';
import { makeMockDb } from './_mock-db';

function prismaError(code: string) {
  return new Prisma.PrismaClientKnownRequestError(`erro ${code}`, { code, clientVersion: 'test' });
}

describe('registrarEntrada (unitário, Prisma mockado)', () => {
  let mock: ReturnType<typeof makeMockDb>;
  beforeEach(() => {
    mock = makeMockDb();
  });

  const base = { alunoId: 'aluno1', atendenteId: 'atend1', unidade: 'barroca' as const, nome: 'Livro X', categoria: 'Livros', valor: 15 };

  it('cria item pendente (sem creditar) e retorna o resumo', async () => {
    const { db, tx } = mock;
    tx.itemPendente.create.mockResolvedValue({
      id: 'p1', codigo: 'ITM-X', nome: 'Livro X', categoria: 'Livros', valor: 15, quantidade: 1, unidade: 'barroca', descricao: null,
    });

    const res = await registrarEntrada(db, base);

    expect(res.id).toBe('p1');
    expect(tx.itemPendente.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ nome: 'Livro X', valor: 15, quantidade: 1, unidade: 'barroca', alunoId: 'aluno1', atendenteId: 'atend1' }) }),
    );
    // Registrar NÃO credita nem toca no saldo.
    expect(tx.user.update).not.toHaveBeenCalled();
    expect(tx.transacao.create).not.toHaveBeenCalled();
  });

  it('normaliza descrição vazia para null', async () => {
    const { db, tx } = mock;
    tx.itemPendente.create.mockResolvedValue({ id: 'p1', codigo: 'X', nome: 'Livro X', categoria: 'Livros', valor: 15, quantidade: 1, unidade: 'barroca', descricao: null });
    await registrarEntrada(db, { ...base, descricao: '   ' });
    expect(tx.itemPendente.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ descricao: null }) }));
  });

  it('valor inválido: rejeita antes de criar', async () => {
    const { db, tx } = mock;
    await expect(registrarEntrada(db, { ...base, valor: 0 })).rejects.toMatchObject({ code: 'VALOR_INVALIDO' });
    expect(tx.itemPendente.create).not.toHaveBeenCalled();
  });
});

describe('colocarEmProducao (unitário, Prisma mockado)', () => {
  let mock: ReturnType<typeof makeMockDb>;
  beforeEach(() => {
    mock = makeMockDb();
  });

  function armarPendente(over: Record<string, unknown> = {}) {
    mock.tx.itemPendente.findUnique.mockResolvedValue({
      id: 'p1', status: 'pendente', codigo: 'ITM-X', nome: 'Livro X', categoria: 'Livros',
      valor: 15, quantidade: 2, unidade: 'barroca', descricao: 'usado', alunoId: 'aluno1',
      atendenteId: 'atend1', aluno: { nome: 'Ana' }, ...over,
    });
  }

  it('push credita valor×qtd, cria item novo e audita (novo=true)', async () => {
    const { db, tx } = mock;
    armarPendente();
    tx.itemPendente.updateMany.mockResolvedValue({ count: 1 });
    tx.item.findUnique.mockResolvedValue(null);
    tx.item.create.mockResolvedValue({ id: 'i1', codigo: 'ITM-X', nome: 'Livro X', categoria: 'Livros', valor: 15, quantidade: 2 });
    tx.user.update.mockResolvedValue({ saldo: 30 });
    tx.transacao.create.mockResolvedValue({ id: 't1' });

    const res = await colocarEmProducao(db, { pendenteId: 'p1' });

    expect(res.novo).toBe(true);
    expect(res.creditado).toBe(30);
    expect(res.saldoAtual).toBe(30);
    expect(res.alunoNome).toBe('Ana');
    expect(tx.user.update).toHaveBeenCalledWith({ where: { id: 'aluno1' }, data: { saldo: { increment: 30 } }, select: { saldo: true } });
    expect(tx.transacao.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ tipo: 'credito_entrada', valor: 30, itemId: 'i1' }) }));
  });

  it('push em item já existente incrementa estoque (novo=false)', async () => {
    const { db, tx } = mock;
    armarPendente({ quantidade: 1, valor: 10 });
    tx.itemPendente.updateMany.mockResolvedValue({ count: 1 });
    tx.item.findUnique.mockResolvedValue({ id: 'i1', descricao: 'existente' });
    tx.item.update.mockResolvedValue({ id: 'i1', codigo: 'ITM-X', nome: 'Livro X', categoria: 'Livros', valor: 10, quantidade: 5 });
    tx.user.update.mockResolvedValue({ saldo: 10 });
    tx.transacao.create.mockResolvedValue({ id: 't1' });

    const res = await colocarEmProducao(db, { pendenteId: 'p1' });

    expect(res.novo).toBe(false);
    expect(res.creditado).toBe(10);
    expect(tx.item.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'i1' }, data: expect.objectContaining({ quantidade: { increment: 1 } }) }));
    expect(tx.item.create).not.toHaveBeenCalled();
  });

  it('pendente inexistente → ITEM_INEXISTENTE', async () => {
    const { db } = mock;
    mock.tx.itemPendente.findUnique.mockResolvedValue(null);
    await expect(colocarEmProducao(db, { pendenteId: 'x' })).rejects.toMatchObject({ code: 'ITEM_INEXISTENTE' });
  });

  it('pendente já em produção → ITEM_NAO_PENDENTE (não credita)', async () => {
    const { db, tx } = mock;
    armarPendente({ status: 'producao' });
    await expect(colocarEmProducao(db, { pendenteId: 'p1' })).rejects.toMatchObject({ code: 'ITEM_NAO_PENDENTE' });
    expect(tx.user.update).not.toHaveBeenCalled();
  });

  it('corrida no push (compare-and-set perde) → ITEM_NAO_PENDENTE', async () => {
    const { db, tx } = mock;
    armarPendente();
    tx.itemPendente.updateMany.mockResolvedValue({ count: 0 });
    await expect(colocarEmProducao(db, { pendenteId: 'p1' })).rejects.toMatchObject({ code: 'ITEM_NAO_PENDENTE' });
    expect(tx.transacao.create).not.toHaveBeenCalled();
  });

  it('aluno sumiu no crédito (P2025) → ALUNO_INEXISTENTE', async () => {
    const { db, tx } = mock;
    armarPendente();
    tx.itemPendente.updateMany.mockResolvedValue({ count: 1 });
    tx.item.findUnique.mockResolvedValue(null);
    tx.item.create.mockResolvedValue({ id: 'i1', codigo: 'ITM-X', nome: 'Livro X', categoria: 'Livros', valor: 15, quantidade: 2 });
    tx.user.update.mockRejectedValue(prismaError('P2025'));
    await expect(colocarEmProducao(db, { pendenteId: 'p1' })).rejects.toBeInstanceOf(DomainError);
  });
});

describe('editarItemPendente (unitário, Prisma mockado)', () => {
  let mock: ReturnType<typeof makeMockDb>;
  beforeEach(() => {
    mock = makeMockDb();
  });

  const base = { id: 'p1', nome: 'Novo', categoria: 'Livros', valor: 20, quantidade: 2, unidade: 'barroca' as const };

  it('edita (compare-and-set em status pendente) e retorna o resumo', async () => {
    const { db, tx } = mock;
    tx.itemPendente.updateMany.mockResolvedValue({ count: 1 });
    tx.itemPendente.findUniqueOrThrow.mockResolvedValue({ id: 'p1', codigo: 'X', nome: 'Novo', categoria: 'Livros', valor: 20, quantidade: 2, unidade: 'barroca', descricao: null });

    const res = await editarItemPendente(db, base);
    expect(res.nome).toBe('Novo');
    expect(tx.itemPendente.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'p1', status: 'pendente' } }));
  });

  it('valor inválido rejeita antes de tocar no banco', async () => {
    const { db, tx } = mock;
    await expect(editarItemPendente(db, { ...base, valor: 0 })).rejects.toMatchObject({ code: 'VALOR_INVALIDO' });
    expect(tx.itemPendente.updateMany).not.toHaveBeenCalled();
  });

  it('já em produção → ITEM_NAO_PENDENTE', async () => {
    const { db, tx } = mock;
    tx.itemPendente.updateMany.mockResolvedValue({ count: 0 });
    tx.itemPendente.findUnique.mockResolvedValue({ id: 'p1' });
    await expect(editarItemPendente(db, base)).rejects.toMatchObject({ code: 'ITEM_NAO_PENDENTE' });
  });

  it('inexistente → ITEM_INEXISTENTE', async () => {
    const { db, tx } = mock;
    tx.itemPendente.updateMany.mockResolvedValue({ count: 0 });
    tx.itemPendente.findUnique.mockResolvedValue(null);
    await expect(editarItemPendente(db, base)).rejects.toMatchObject({ code: 'ITEM_INEXISTENTE' });
  });
});
