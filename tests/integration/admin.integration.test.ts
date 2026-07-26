import { it, expect } from 'vitest';
import { prisma } from '@/lib/prisma';
import { ajustarSaldo } from '@/domain/admin';
import { getAdminDashboard } from '@/server/queries';
import { describeDb } from '../helpers/db';
import { criarUsuario, criarItem } from '../helpers/factories';

describeDb('Admin (integração, Postgres real)', () => {
  it('ajustarSaldo atualiza o saldo e audita (ajuste_manual com sinal)', async () => {
    const u = await criarUsuario({ saldo: 10 });

    const up = await ajustarSaldo(prisma, { userId: u.id, novoSaldo: 25 });
    expect(up).toEqual({ saldoAtual: 25, delta: 15 });

    const down = await ajustarSaldo(prisma, { userId: u.id, novoSaldo: 5 });
    expect(down.delta).toBe(-20);

    const noBanco = await prisma.user.findUniqueOrThrow({ where: { id: u.id } });
    expect(noBanco.saldo).toBe(5);

    const ajustes = await prisma.transacao.findMany({
      where: { userId: u.id, tipo: 'ajuste_manual' },
      orderBy: { createdAt: 'asc' },
    });
    expect(ajustes.map((a) => a.valor)).toEqual([15, -20]);
  });

  it('getAdminDashboard roda e reflete os números', async () => {
    const u = await criarUsuario({ saldo: 30 });
    await criarItem({ categoria: 'Livros', valor: 2, quantidade: 4 });
    await ajustarSaldo(prisma, { userId: u.id, novoSaldo: 40 });

    const d = await getAdminDashboard();
    expect(d.fichasEmCirculacao).toBe(40);
    expect(d.itensEmEstoque).toBe(4);
    expect(d.transacoesPorDia).toHaveLength(7);
    expect(d.itensPorCategoria.some((c) => c.label === 'Livros' && c.value === 4)).toBe(true);
  });
});
