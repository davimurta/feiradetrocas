import { it, expect, beforeEach } from 'vitest';
import { Papel } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { __setMockUserId } from '@/lib/auth';
import {
  editarItemAction,
  excluirItemAction,
  ajustarSaldoAction,
  editarUsuarioAction,
} from '@/app/actions/admin';
import { describeDb } from '../helpers/db';
import { criarUsuario, criarItem } from '../helpers/factories';

beforeEach(() => __setMockUserId(null));

describeDb('Admin via Server Actions', () => {
  it('admin edita item, ajusta saldo e muda papel', async () => {
    const admin = await criarUsuario({ papel: Papel.admin });
    const aluno = await criarUsuario({ saldo: 5 });
    const item = await criarItem({ nome: 'Livro', categoria: 'Livros', valor: 2, quantidade: 3 });
    __setMockUserId(admin.id);

    const ed = await editarItemAction({ id: item.id, nome: 'Livro editado', categoria: 'Outros', valor: 4, quantidade: 9, unidade: 'floresta' });
    expect(ed.ok).toBe(true);
    if (ed.ok) expect(ed.data).toMatchObject({ nome: 'Livro editado', valor: 4, quantidade: 9, unidade: 'floresta' });

    const aj = await ajustarSaldoAction({ id: aluno.id, novoSaldo: 50 });
    expect(aj.ok && aj.data.saldoAtual).toBe(50);

    const up = await editarUsuarioAction({ id: aluno.id, nome: aluno.nome, papel: Papel.atendente_stand, unidade: 'floresta' });
    expect(up.ok && up.data.papel).toBe(Papel.atendente_stand);

    const noBanco = await prisma.user.findUniqueOrThrow({ where: { id: aluno.id } });
    expect(noBanco.saldo).toBe(50);
    expect(noBanco.papel).toBe(Papel.atendente_stand);
  });

  it('admin "coloca a rule" numa conta pendente → libera (pendente=false)', async () => {
    const admin = await criarUsuario({ papel: Papel.admin });
    const pendente = await criarUsuario({ papel: Papel.participante, pendente: true, unidade: 'barroca' });
    __setMockUserId(admin.id);

    const r = await editarUsuarioAction({ id: pendente.id, nome: pendente.nome, papel: Papel.participante, unidade: 'floresta' });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.pendente).toBe(false);

    const noBanco = await prisma.user.findUniqueOrThrow({ where: { id: pendente.id } });
    expect(noBanco.pendente).toBe(false);
    expect(noBanco.unidade).toBe('floresta');
  });

  it('não-admin é bloqueado (NAO_AUTORIZADO)', async () => {
    const aluno = await criarUsuario({ papel: Papel.participante });
    const item = await criarItem();
    __setMockUserId(aluno.id);
    const r = await editarItemAction({ id: item.id, nome: 'x', categoria: 'Outros', valor: 1, quantidade: 1, unidade: 'barroca' });
    expect(r).toMatchObject({ ok: false, error: { code: 'NAO_AUTORIZADO' } });
  });

  it('excluir item preserva o histórico (itemId vira null, saldo intacto)', async () => {
    const admin = await criarUsuario({ papel: Papel.admin });
    const aluno = await criarUsuario({ saldo: 100 });
    const item = await criarItem({ valor: 3, quantidade: 2 });
    const tx = await prisma.transacao.create({
      data: { tipo: 'debito_compra', valor: 3, quantidade: 1, userId: aluno.id, itemId: item.id },
    });

    __setMockUserId(admin.id);
    const r = await excluirItemAction({ id: item.id });
    expect(r.ok).toBe(true);

    // Item removido, mas o lançamento no extrato permanece (sem vínculo com o item).
    expect(await prisma.item.count({ where: { id: item.id } })).toBe(0);
    const noBanco = await prisma.transacao.findUniqueOrThrow({ where: { id: tx.id } });
    expect(noBanco.itemId).toBeNull();
    const c = await prisma.user.findUniqueOrThrow({ where: { id: aluno.id } });
    expect(c.saldo).toBe(100); // saldo não é afetado pela exclusão do item
  });
});
