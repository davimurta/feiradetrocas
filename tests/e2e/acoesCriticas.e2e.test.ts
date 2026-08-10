import { it, expect, beforeEach } from 'vitest';
import { Papel } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { __setMockUserId } from '@/lib/auth';
import {
  previaAcoesCriticasAction,
  zerarSaldosAction,
  creditarEmLoteAction,
  moverItensDeUnidadeAction,
  cancelarPedidosPendentesAction,
  desbloquearContasAction,
} from '@/app/actions/acoesCriticas';
import { describeDb } from '../helpers/db';
import { criarUsuario, criarAtendente, criarItem } from '../helpers/factories';

beforeEach(() => __setMockUserId(null));

describeDb('Ações críticas via Server Actions', () => {
  it('sem login: NAO_AUTENTICADO em todas', async () => {
    expect(await previaAcoesCriticasAction()).toMatchObject({
      ok: false,
      error: { code: 'NAO_AUTENTICADO' },
    });
    expect(await zerarSaldosAction({ confirmacao: 'CONFIRMAR' })).toMatchObject({
      ok: false,
      error: { code: 'NAO_AUTENTICADO' },
    });
  });

  it('atendente não executa ação crítica (NAO_AUTORIZADO)', async () => {
    const stand = await criarAtendente(Papel.atendente_stand);
    const aluno = await criarUsuario({ saldo: 25 });
    __setMockUserId(stand.id);

    const r = await zerarSaldosAction({ confirmacao: 'CONFIRMAR' });

    expect(r).toMatchObject({ ok: false, error: { code: 'NAO_AUTORIZADO' } });
    expect((await prisma.user.findUniqueOrThrow({ where: { id: aluno.id } })).saldo).toBe(25);
  });

  it('sem a frase de confirmação nada é executado', async () => {
    const admin = await criarAtendente(Papel.admin);
    const aluno = await criarUsuario({ saldo: 40 });
    __setMockUserId(admin.id);

    const r = await zerarSaldosAction({ confirmacao: 'sim' });

    expect(r).toMatchObject({ ok: false, error: { code: 'CONFIRMACAO_INVALIDA' } });
    expect((await prisma.user.findUniqueOrThrow({ where: { id: aluno.id } })).saldo).toBe(40);
  });

  it('a confirmação aceita minúsculas e espaços', async () => {
    const admin = await criarAtendente(Papel.admin);
    await criarUsuario({ saldo: 15 });
    __setMockUserId(admin.id);

    const r = await zerarSaldosAction({ confirmacao: '  confirmar ' });

    expect(r).toMatchObject({ ok: true, data: { contasAfetadas: 1, fichas: 15 } });
  });

  it('admin credita em lote e o ajuste fica auditado no extrato', async () => {
    const admin = await criarAtendente(Papel.admin);
    const aluno = await criarUsuario({ saldo: 0 });
    __setMockUserId(admin.id);

    const r = await creditarEmLoteAction({ confirmacao: 'CONFIRMAR', valor: 100 });

    expect(r).toMatchObject({ ok: true, data: { contasAfetadas: 1, fichas: 100 } });
    expect((await prisma.user.findUniqueOrThrow({ where: { id: aluno.id } })).saldo).toBe(100);
    const t = await prisma.transacao.findFirstOrThrow({ where: { userId: aluno.id } });
    expect(t).toMatchObject({ tipo: 'ajuste_manual', valor: 100, atendenteId: admin.id });
  });

  it('mover itens exige unidades diferentes', async () => {
    const admin = await criarAtendente(Papel.admin);
    __setMockUserId(admin.id);

    const r = await moverItensDeUnidadeAction({
      confirmacao: 'CONFIRMAR',
      de: 'barroca',
      para: 'barroca',
    });

    expect(r).toMatchObject({ ok: false, error: { code: 'VALOR_INVALIDO' } });
  });

  it('mover itens leva o catálogo para a outra unidade', async () => {
    const admin = await criarAtendente(Papel.admin);
    const item = await criarItem({ unidade: 'barroca', quantidade: 2 });
    __setMockUserId(admin.id);

    const r = await moverItensDeUnidadeAction({
      confirmacao: 'CONFIRMAR',
      de: 'barroca',
      para: 'floresta',
    });

    expect(r).toMatchObject({ ok: true, data: { movidos: 1 } });
    expect((await prisma.item.findUniqueOrThrow({ where: { id: item.id } })).unidade).toBe(
      'floresta',
    );
  });

  it('cancelar pedidos e desbloquear contas respondem com a contagem', async () => {
    const admin = await criarAtendente(Papel.admin);
    const bloqueado = await criarUsuario();
    await prisma.user.update({ where: { id: bloqueado.id }, data: { bloqueado: true } });
    __setMockUserId(admin.id);

    expect(await cancelarPedidosPendentesAction({ confirmacao: 'CONFIRMAR' })).toMatchObject({
      ok: true,
      data: { cancelados: 0 },
    });
    expect(await desbloquearContasAction({ confirmacao: 'CONFIRMAR' })).toMatchObject({
      ok: true,
      data: { desbloqueadas: 1 },
    });
  });

  it('a prévia só responde para admin', async () => {
    const admin = await criarAtendente(Papel.admin);
    await criarUsuario({ saldo: 12 });
    __setMockUserId(admin.id);

    const r = await previaAcoesCriticasAction();

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.fichasEmCirculacao).toBe(12);
    expect(r.data.contasComSaldo).toBe(1);
  });
});
