import { describe, it, expect, beforeEach } from 'vitest';
import { ajustarSaldo } from '@/domain/admin';
import { makeMockDb } from './_mock-db';

describe('ajustarSaldo (unitário, Prisma mockado)', () => {
  let mock: ReturnType<typeof makeMockDb>;
  beforeEach(() => {
    mock = makeMockDb();
  });

  it('aumenta saldo: atualiza e registra ajuste_manual com delta positivo', async () => {
    const { db, tx } = mock;
    tx.user.findUnique.mockResolvedValue({ saldo: 10 });
    tx.user.update.mockResolvedValue({});
    tx.transacao.create.mockResolvedValue({ id: 't1' });

    const res = await ajustarSaldo(db, { userId: 'u1', novoSaldo: 25, atendenteId: 'a1' });

    expect(res).toEqual({ saldoAtual: 25, delta: 15 });
    expect(tx.user.update).toHaveBeenCalledWith({ where: { id: 'u1' }, data: { saldo: 25 } });
    expect(tx.transacao.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ tipo: 'ajuste_manual', valor: 15, userId: 'u1' }) }),
    );
  });

  it('diminui saldo: delta negativo no ajuste', async () => {
    const { db, tx } = mock;
    tx.user.findUnique.mockResolvedValue({ saldo: 10 });
    tx.user.update.mockResolvedValue({});
    tx.transacao.create.mockResolvedValue({ id: 't1' });

    const res = await ajustarSaldo(db, { userId: 'u1', novoSaldo: 3 });
    expect(res.delta).toBe(-7);
    expect(tx.transacao.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ valor: -7 }) }),
    );
  });

  it('sem mudança: não atualiza nem lança transação', async () => {
    const { db, tx } = mock;
    tx.user.findUnique.mockResolvedValue({ saldo: 10 });
    const res = await ajustarSaldo(db, { userId: 'u1', novoSaldo: 10 });
    expect(res.delta).toBe(0);
    expect(tx.user.update).not.toHaveBeenCalled();
    expect(tx.transacao.create).not.toHaveBeenCalled();
  });

  it('saldo negativo: rejeita VALOR_INVALIDO', async () => {
    const { db } = mock;
    await expect(ajustarSaldo(db, { userId: 'u1', novoSaldo: -1 })).rejects.toMatchObject({ code: 'VALOR_INVALIDO' });
  });

  it('usuário inexistente: rejeita ALUNO_INEXISTENTE', async () => {
    const { db, tx } = mock;
    tx.user.findUnique.mockResolvedValue(null);
    await expect(ajustarSaldo(db, { userId: 'x', novoSaldo: 5 })).rejects.toMatchObject({ code: 'ALUNO_INEXISTENTE' });
  });
});
