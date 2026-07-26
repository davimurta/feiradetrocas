import { it, expect, beforeEach } from 'vitest';
import { Papel } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { __setMockUserId } from '@/lib/auth';
import { receberItemAction } from '@/app/actions/entrada';
import { criarPedidoAction } from '@/app/actions/venda';
import { aprovarPedidoAction } from '@/app/actions/pedido';
import { describeDb } from '../helpers/db';
import { criarAtendente, criarUsuario } from '../helpers/factories';

beforeEach(() => __setMockUserId(null));

describeDb('Fluxo via Server Actions (recepção → pedido → aprovação)', () => {
  it('recepção credita; stand cria pedido; comprador aprova → saldo debita', async () => {
    const entrada = await criarAtendente(Papel.atendente_entrada, 'barroca');
    const stand = await criarAtendente(Papel.atendente_stand, 'barroca');

    // 1) Recepção recebe item da matrícula 10240099 (começa com 1 → Barroca; credita 10).
    __setMockUserId(entrada.id);
    const rec = await receberItemAction({ matricula: '10240099', nome: 'Livro', categoria: 'Livros', valor: 10, unidade: 'barroca' });
    expect(rec.ok).toBe(true);
    if (!rec.ok) return;

    const aluno = await prisma.user.findUniqueOrThrow({ where: { codigoCarteira: '10240099' } });
    expect(aluno.saldo).toBe(10);
    expect(aluno.unidade).toBe('barroca'); // unidade pela regra da matrícula (começa com 1)

    // 2) Stand cria o PEDIDO (pendente, nada debitado ainda).
    __setMockUserId(stand.id);
    const ped = await criarPedidoAction({ itemId: rec.data.item.id, codigoCarteira: '10240099' });
    expect(ped.ok).toBe(true);
    if (!ped.ok) return;
    expect((await prisma.user.findUniqueOrThrow({ where: { id: aluno.id } })).saldo).toBe(10); // ainda não debitou

    // 3) Comprador aprova → finaliza.
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

  it('não pode aprovar pedido de outra pessoa (NAO_AUTORIZADO)', async () => {
    const entrada = await criarAtendente(Papel.atendente_entrada, 'barroca');
    const stand = await criarAtendente(Papel.atendente_stand, 'barroca');
    __setMockUserId(entrada.id);
    const rec = await receberItemAction({ matricula: '20240300', nome: 'Livro', categoria: 'Livros', valor: 3, unidade: 'barroca' });
    if (!rec.ok) return;
    __setMockUserId(stand.id);
    const ped = await criarPedidoAction({ itemId: rec.data.item.id, codigoCarteira: '20240300' });
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
});
