import { describe, it, expect, beforeEach } from 'vitest';
import { criarReporte, definirBloqueio } from '@/domain/reporte';
import { makeMockDb } from './_mock-db';

describe('criarReporte (unitário, Prisma mockado)', () => {
  let mock: ReturnType<typeof makeMockDb>;
  beforeEach(() => {
    mock = makeMockDb();
  });

  it('deriva o denunciado do pedido e cria o reporte', async () => {
    const { db, tx } = mock;
    tx.pedido.findUnique.mockResolvedValue({ id: 'ped1', comprador: { id: 'c1', nome: 'Ana' } });
    tx.reporte.create.mockResolvedValue({ id: 'r1' });

    const res = await criarReporte(db, { pedidoId: 'ped1', reportanteId: 'a1', motivo: 'furto', descricao: 'levou sem pagar' });

    expect(res).toEqual({ id: 'r1', reportadoNome: 'Ana' });
    expect(tx.reporte.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ reportadoId: 'c1', reportanteId: 'a1', pedidoId: 'ped1', motivo: 'furto' }) }),
    );
  });

  it('pedido inexistente → PEDIDO_INEXISTENTE', async () => {
    const { db, tx } = mock;
    tx.pedido.findUnique.mockResolvedValue(null);
    await expect(criarReporte(db, { pedidoId: 'x', reportanteId: 'a1', motivo: 'x' })).rejects.toMatchObject({ code: 'PEDIDO_INEXISTENTE' });
    expect(tx.reporte.create).not.toHaveBeenCalled();
  });
});

describe('definirBloqueio (unitário, Prisma mockado)', () => {
  let mock: ReturnType<typeof makeMockDb>;
  beforeEach(() => {
    mock = makeMockDb();
  });

  it('bloqueia a conta', async () => {
    const { db, tx } = mock;
    tx.user.update.mockResolvedValue({ id: 'u1', bloqueado: true });
    const res = await definirBloqueio(db, { userId: 'u1', bloqueado: true });
    expect(res).toEqual({ id: 'u1', bloqueado: true });
    expect(tx.user.update).toHaveBeenCalledWith({
      where: { id: 'u1' },
      data: { bloqueado: true, sessionVersion: { increment: 1 } },
      select: { id: true, bloqueado: true },
    });
  });

  it('usuário inexistente → ALUNO_INEXISTENTE', async () => {
    const { db, tx } = mock;
    tx.user.update.mockRejectedValue(new Error('not found'));
    await expect(definirBloqueio(db, { userId: 'x', bloqueado: true })).rejects.toMatchObject({ code: 'ALUNO_INEXISTENTE' });
  });
});
