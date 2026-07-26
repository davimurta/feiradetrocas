import { describe, it, expect, beforeEach } from 'vitest';
import { Prisma } from '@prisma/client';
import { receberItem } from '@/domain/entrada';
import { DomainError } from '@/lib/errors';
import { makeMockDb } from './_mock-db';

function prismaError(code: string) {
  return new Prisma.PrismaClientKnownRequestError(`erro ${code}`, { code, clientVersion: 'test' });
}

describe('receberItem (unitário, Prisma mockado)', () => {
  let mock: ReturnType<typeof makeMockDb>;
  beforeEach(() => {
    mock = makeMockDb();
  });

  const base = { alunoId: 'aluno1', atendenteId: 'atend1', unidade: 'barroca' as const, nome: 'Livro X', categoria: 'Livros', valor: 15 };

  it('item novo: cria item, credita e audita (novo=true)', async () => {
    const { db, tx } = mock;
    tx.item.findUnique.mockResolvedValue(null); // não existe stack ainda
    tx.item.create.mockResolvedValue({ id: 'i1', codigo: 'ITM-X', nome: 'Livro X', categoria: 'Livros', valor: 15, quantidade: 1 });
    tx.user.update.mockResolvedValue({ saldo: 15 });
    tx.transacao.create.mockResolvedValue({ id: 'tx1' });

    const res = await receberItem(db, base);

    expect(res.novo).toBe(true);
    expect(res.creditado).toBe(15);
    expect(res.saldoAtual).toBe(15);
    expect(tx.user.update).toHaveBeenCalledWith({
      where: { id: 'aluno1' },
      data: { saldo: { increment: 15 } },
      select: { saldo: true },
    });
    expect(tx.item.create).toHaveBeenCalled();
  });

  it('item repetido (mesmo nome+valor): incrementa estoque (novo=false)', async () => {
    const { db, tx } = mock;
    tx.item.findUnique.mockResolvedValue({ id: 'i1' }); // stack já existe
    tx.item.update.mockResolvedValue({ id: 'i1', codigo: 'ITM-X', nome: 'Livro X', categoria: 'Livros', valor: 15, quantidade: 3 });
    tx.user.update.mockResolvedValue({ saldo: 45 });
    tx.transacao.create.mockResolvedValue({ id: 'tx1' });

    const res = await receberItem(db, base);

    expect(res.novo).toBe(false);
    expect(res.item.quantidade).toBe(3);
    expect(tx.item.update).toHaveBeenCalledWith({
      where: { id: 'i1' },
      data: { quantidade: { increment: 1 } },
      select: expect.anything(),
    });
    expect(tx.item.create).not.toHaveBeenCalled();
  });

  it('credita valor × quantidade', async () => {
    const { db, tx } = mock;
    tx.item.findUnique.mockResolvedValue(null);
    tx.item.create.mockResolvedValue({ id: 'i1', codigo: 'ITM-X', nome: 'Livro X', categoria: 'Livros', valor: 15, quantidade: 3 });
    tx.user.update.mockResolvedValue({ saldo: 45 });
    tx.transacao.create.mockResolvedValue({ id: 'tx1' });

    const res = await receberItem(db, { ...base, quantidade: 3 });
    expect(res.creditado).toBe(45);
    expect(tx.user.update).toHaveBeenCalledWith(expect.objectContaining({ data: { saldo: { increment: 45 } } }));
  });

  it('valor inválido: rejeita antes da transação', async () => {
    const { db, tx } = mock;
    await expect(receberItem(db, { ...base, valor: 0 })).rejects.toMatchObject({ code: 'VALOR_INVALIDO' });
    expect(db.$transaction).not.toHaveBeenCalled();
    expect(tx.user.update).not.toHaveBeenCalled();
  });

  it('aluno inexistente (P2025): rejeita ALUNO_INEXISTENTE', async () => {
    const { db, tx } = mock;
    tx.item.findUnique.mockResolvedValue(null);
    tx.item.create.mockResolvedValue({ id: 'i1', codigo: 'ITM-X', nome: 'Livro X', categoria: 'Livros', valor: 15, quantidade: 1 });
    tx.user.update.mockRejectedValue(prismaError('P2025'));

    await expect(receberItem(db, base)).rejects.toBeInstanceOf(DomainError);
    await expect(receberItem(db, base)).rejects.toMatchObject({ code: 'ALUNO_INEXISTENTE' });
  });
});
