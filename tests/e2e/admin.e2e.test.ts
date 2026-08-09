import { it, expect, beforeEach } from 'vitest';
import { Papel } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { __setMockUserId } from '@/lib/auth';
import {
  editarItemAction,
  excluirItemAction,
  ajustarSaldoAction,
  editarUsuarioAction,
  listarReportesAction,
  bloquearContaAction,
} from '@/app/actions/admin';
import { criarPedidoAction, reportarAction } from '@/app/actions/venda';
import { loginComSenhaAction } from '@/app/actions/auth';
import { describeDb } from '../helpers/db';
import { criarUsuario, criarItem, criarAtendente } from '../helpers/factories';

beforeEach(() => __setMockUserId(null));

describeDb('Admin via Server Actions', () => {
  it('admin edita item, ajusta saldo e muda papel', async () => {
    const admin = await criarUsuario({ papel: Papel.admin });
    const aluno = await criarUsuario({ saldo: 5 });
    const item = await criarItem({ nome: 'Livro', categoria: 'Livros', valor: 2, quantidade: 3 });
    __setMockUserId(admin.id);

    const ed = await editarItemAction({ id: item.id, nome: 'Livro editado', categoria: 'Outros', valor: 4, quantidade: 9, descricao: 'edição revisada', unidade: 'floresta' });
    expect(ed.ok).toBe(true);
    if (ed.ok) expect(ed.data).toMatchObject({ nome: 'Livro editado', valor: 4, quantidade: 9, unidade: 'floresta', descricao: 'edição revisada' });

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

  it('stand reporta comprador; admin lista, bloqueia (login barrado) e zera saldo', async () => {
    const stand = await criarAtendente(Papel.atendente_stand, 'barroca');
    const admin = await criarUsuario({ papel: Papel.admin });
    const comprador = await criarUsuario({ email: 'reportado@aluno.cotemig.com.br', saldo: 30, provider: 'password', senhaHash: null });
    const item = await criarItem({ valor: 5, quantidade: 3 });

    // Stand cria o pedido e reporta o comprador.
    __setMockUserId(stand.id);
    const ped = await criarPedidoAction({ itemId: item.id, codigoCarteira: comprador.codigoCarteira });
    expect(ped.ok).toBe(true);
    if (!ped.ok) return;
    const rep = await reportarAction({ pedidoId: ped.data.pedidoId, motivo: 'furto', descricao: 'não pagou' });
    expect(rep.ok).toBe(true);

    // Admin vê o reporte e age.
    __setMockUserId(admin.id);
    const lista = await listarReportesAction();
    expect(lista.ok && lista.data).toHaveLength(1);
    if (!lista.ok) return;
    expect(lista.data[0]).toMatchObject({ motivo: 'furto', reportadoMatricula: comprador.codigoCarteira });

    const bloq = await bloquearContaAction({ id: comprador.id, bloqueado: true });
    expect(bloq.ok && bloq.data.bloqueado).toBe(true);

    const zerar = await ajustarSaldoAction({ id: comprador.id, novoSaldo: 0 });
    expect(zerar.ok && zerar.data.saldoAtual).toBe(0);

    // Conta bloqueada não loga.
    __setMockUserId(null);
    const login = await loginComSenhaAction({ email: 'reportado@aluno.cotemig.com.br', senha: 'qualquer' });
    expect(login).toMatchObject({ ok: false, error: { code: 'CONTA_BLOQUEADA' } });
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
