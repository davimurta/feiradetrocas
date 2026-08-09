import { it, expect, beforeEach } from 'vitest';
import { Papel } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { __setMockUserId } from '@/lib/auth';
import { receberItemAction, pushProducaoAction, pushTodosProducaoAction } from '@/app/actions/entrada';
import { criarPedidoAction } from '@/app/actions/venda';
import { aprovarPedidoAction } from '@/app/actions/pedido';
import { sincronizarCarteiraAction } from '@/app/actions/carteira';
import { describeDb } from '../helpers/db';
import { criarAtendente, criarUsuario } from '../helpers/factories';

beforeEach(() => __setMockUserId(null));

describeDb('Fluxo via Server Actions (recepção → produção → pedido → aprovação)', () => {
  it('recepção deixa pendente; push credita; stand cria pedido; comprador aprova → saldo debita', async () => {
    const entrada = await criarAtendente(Papel.atendente_entrada, 'barroca');
    const stand = await criarAtendente(Papel.atendente_stand, 'barroca');

    // 1) Recepção recebe item da matrícula 10240099 (começa com 1 → Barroca). Fica PENDENTE.
    __setMockUserId(entrada.id);
    const rec = await receberItemAction({ matricula: '10240099', nome: 'Livro', categoria: 'Livros', valor: 10, unidade: 'barroca' });
    expect(rec.ok).toBe(true);
    if (!rec.ok) return;

    const aluno = await prisma.user.findUniqueOrThrow({ where: { codigoCarteira: '10240099' } });
    expect(aluno.saldo).toBe(0); // ainda não creditado (pendente)
    expect(aluno.unidade).toBe('barroca'); // unidade pela regra da matrícula (começa com 1)

    // 2) Push → credita e cria o item de estoque.
    const push = await pushProducaoAction({ id: rec.data.id });
    expect(push.ok).toBe(true);
    if (!push.ok) return;
    expect((await prisma.user.findUniqueOrThrow({ where: { id: aluno.id } })).saldo).toBe(10);

    // 3) Stand cria o PEDIDO (pendente, nada debitado ainda).
    __setMockUserId(stand.id);
    const ped = await criarPedidoAction({ itemId: push.data.item.id, codigoCarteira: '10240099' });
    expect(ped.ok).toBe(true);
    if (!ped.ok) return;
    expect((await prisma.user.findUniqueOrThrow({ where: { id: aluno.id } })).saldo).toBe(10); // ainda não debitou

    // 4) Comprador aprova → finaliza.
    __setMockUserId(aluno.id);
    const ap = await aprovarPedidoAction({ pedidoId: ped.data.pedidoId });
    expect(ap.ok && ap.data.saldoAtual).toBe(0);

    const p = await prisma.pedido.findUniqueOrThrow({ where: { id: ped.data.pedidoId } });
    expect(p.status).toBe('aprovado');
    expect((await prisma.user.findUniqueOrThrow({ where: { id: aluno.id } })).saldo).toBe(0);
  });

  it('participante não pode criar pedido (NAO_AUTORIZADO)', async () => {
    const aluno = await criarUsuario({ papel: Papel.participante });
    __setMockUserId(aluno.id);
    const r = await criarPedidoAction({ itemId: 'x', codigoCarteira: aluno.codigoCarteira });
    expect(r).toMatchObject({ ok: false, error: { code: 'NAO_AUTORIZADO' } });
  });

  it('participante não pode dar push em produção (NAO_AUTORIZADO)', async () => {
    const aluno = await criarUsuario({ papel: Papel.participante });
    __setMockUserId(aluno.id);
    const r = await pushProducaoAction({ id: 'x' });
    expect(r).toMatchObject({ ok: false, error: { code: 'NAO_AUTORIZADO' } });
  });

  it('não pode aprovar pedido de outra pessoa (NAO_AUTORIZADO)', async () => {
    const entrada = await criarAtendente(Papel.atendente_entrada, 'barroca');
    const stand = await criarAtendente(Papel.atendente_stand, 'barroca');
    __setMockUserId(entrada.id);
    const rec = await receberItemAction({ matricula: '20240300', nome: 'Livro', categoria: 'Livros', valor: 3, unidade: 'barroca' });
    if (!rec.ok) return;
    const push = await pushProducaoAction({ id: rec.data.id });
    if (!push.ok) return;
    __setMockUserId(stand.id);
    const ped = await criarPedidoAction({ itemId: push.data.item.id, codigoCarteira: '20240300' });
    if (!ped.ok) return;

    const intruso = await criarUsuario({ papel: Papel.participante });
    __setMockUserId(intruso.id);
    const r = await aprovarPedidoAction({ pedidoId: ped.data.pedidoId });
    expect(r).toMatchObject({ ok: false, error: { code: 'NAO_AUTORIZADO' } });
  });

  it('sem login: NAO_AUTENTICADO', async () => {
    const r = await receberItemAction({ matricula: 'x', nome: 'X', categoria: 'Outros', valor: 1, unidade: 'barroca' });
    expect(r).toMatchObject({ ok: false, error: { code: 'NAO_AUTENTICADO' } });
  });

  it('a carteira do aluno enxerga o crédito do push sem recarregar a página', async () => {
    const entrada = await criarAtendente(Papel.atendente_entrada, 'barroca');
    __setMockUserId(entrada.id);
    const rec = await receberItemAction({ matricula: '10240777', nome: 'Mochila', categoria: 'Outros', valor: 8, unidade: 'barroca' });
    expect(rec.ok).toBe(true);
    if (!rec.ok) return;

    const aluno = await prisma.user.findUniqueOrThrow({ where: { codigoCarteira: '10240777' } });

    // Estado que a carteira aberta do aluno já tinha: pendente ainda não credita.
    __setMockUserId(aluno.id);
    const antes = await sincronizarCarteiraAction();
    expect(antes).toMatchObject({ ok: true, data: { saldo: 0, historico: [] } });

    // Push acontece na máquina da recepção, não na carteira.
    __setMockUserId(entrada.id);
    expect((await pushProducaoAction({ id: rec.data.id })).ok).toBe(true);

    // O polling da carteira busca de novo — é o que substitui o F5.
    __setMockUserId(aluno.id);
    const depois = await sincronizarCarteiraAction();
    expect(depois.ok).toBe(true);
    if (!depois.ok) return;
    expect(depois.data.saldo).toBe(8);
    expect(depois.data.historico[0]).toMatchObject({ tipo: 'credito_entrada', valor: 8, itemNome: 'Mochila' });
  });

  it('sincronizar carteira sem login: NAO_AUTENTICADO', async () => {
    expect(await sincronizarCarteiraAction()).toMatchObject({
      ok: false,
      error: { code: 'NAO_AUTENTICADO' },
    });
  });

  it('push em lote por ids só produz os selecionados', async () => {
    const entrada = await criarAtendente(Papel.atendente_entrada, 'barroca');
    __setMockUserId(entrada.id);
    const a = await receberItemAction({ matricula: '10240801', nome: 'Régua', categoria: 'Papelaria', valor: 2, unidade: 'barroca' });
    const b = await receberItemAction({ matricula: '10240802', nome: 'Compasso', categoria: 'Papelaria', valor: 5, unidade: 'barroca' });
    if (!a.ok || !b.ok) return;

    const r = await pushTodosProducaoAction({ ids: [a.data.id] });
    expect(r).toMatchObject({ ok: true, data: { total: 1, creditadoTotal: 2, falhas: 0, idsOk: [a.data.id] } });

    const restantes = await prisma.itemPendente.findMany({ where: { status: 'pendente' }, select: { id: true } });
    expect(restantes.map((x) => x.id)).toEqual([b.data.id]);
  });
});
