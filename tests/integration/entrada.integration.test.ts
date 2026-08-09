import { it, expect } from 'vitest';
import { Papel } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { registrarEntrada, colocarEmProducao, editarItemPendente } from '@/domain/entrada';
import { describeDb } from '../helpers/db';
import { criarUsuario, criarAtendente } from '../helpers/factories';

describeDb('Entrada / produção (integração, Postgres real)', () => {
  it('registrarEntrada deixa PENDENTE sem creditar; push credita, cria item e lança no extrato', async () => {
    const aluno = await criarUsuario({ saldo: 0 });
    const atendente = await criarAtendente(Papel.atendente_entrada, 'barroca');

    const pend = await registrarEntrada(prisma, {
      alunoId: aluno.id,
      atendenteId: atendente.id,
      unidade: 'barroca',
      nome: 'Livro de História',
      categoria: 'Livros',
      valor: 20,
      descricao: 'capa dura',
    });

    // Enquanto pendente: nada creditado, sem estoque, sem extrato.
    expect((await prisma.user.findUniqueOrThrow({ where: { id: aluno.id } })).saldo).toBe(0);
    expect(await prisma.item.count()).toBe(0);
    expect(await prisma.transacao.count()).toBe(0);
    expect((await prisma.itemPendente.findUniqueOrThrow({ where: { id: pend.id } })).status).toBe('pendente');

    const prod = await colocarEmProducao(prisma, { pendenteId: pend.id });
    expect(prod.novo).toBe(true);
    expect(prod.creditado).toBe(20);
    expect(prod.saldoAtual).toBe(20);

    const item = await prisma.item.findUniqueOrThrow({ where: { id: prod.item.id } });
    expect(item.quantidade).toBe(1);
    expect(item.unidade).toBe('barroca');
    expect(item.descricao).toBe('capa dura');
    expect((await prisma.user.findUniqueOrThrow({ where: { id: aluno.id } })).saldo).toBe(20);
    expect(await prisma.transacao.count({ where: { userId: aluno.id, tipo: 'credito_entrada' } })).toBe(1);
    expect((await prisma.itemPendente.findUniqueOrThrow({ where: { id: pend.id } })).status).toBe('producao');
  });

  it('push faz stacking por unidade (mesmo nome+valor soma; outra unidade cria novo)', async () => {
    const aluno = await criarUsuario();
    const atendente = await criarAtendente(Papel.atendente_entrada);
    const comum = { alunoId: aluno.id, atendenteId: atendente.id, nome: 'Caneta', categoria: 'Papelaria', valor: 2 };

    const p1 = await registrarEntrada(prisma, { ...comum, unidade: 'barroca' });
    const p2 = await registrarEntrada(prisma, { ...comum, unidade: 'barroca' });
    const p3 = await registrarEntrada(prisma, { ...comum, unidade: 'floresta' });

    const a = await colocarEmProducao(prisma, { pendenteId: p1.id });
    const b = await colocarEmProducao(prisma, { pendenteId: p2.id });
    const c = await colocarEmProducao(prisma, { pendenteId: p3.id });

    expect(a.item.id).toBe(b.item.id); // stack na barroca
    expect(c.item.id).not.toBe(a.item.id); // floresta é outro item

    expect((await prisma.item.findUniqueOrThrow({ where: { id: a.item.id } })).quantidade).toBe(2);
    expect((await prisma.item.findUniqueOrThrow({ where: { id: c.item.id } })).quantidade).toBe(1);
    expect(await prisma.item.count({ where: { nome: 'Caneta' } })).toBe(2);
  });

  it('push duplicado do mesmo pendente não credita duas vezes (ITEM_NAO_PENDENTE)', async () => {
    const aluno = await criarUsuario({ saldo: 0 });
    const atendente = await criarAtendente(Papel.atendente_entrada, 'barroca');
    const pend = await registrarEntrada(prisma, { alunoId: aluno.id, atendenteId: atendente.id, unidade: 'barroca', nome: 'Bola', categoria: 'Brinquedos', valor: 8 });

    await colocarEmProducao(prisma, { pendenteId: pend.id });
    await expect(colocarEmProducao(prisma, { pendenteId: pend.id })).rejects.toMatchObject({ code: 'ITEM_NAO_PENDENTE' });

    expect((await prisma.user.findUniqueOrThrow({ where: { id: aluno.id } })).saldo).toBe(8); // creditado uma vez só
    expect(await prisma.transacao.count({ where: { userId: aluno.id, tipo: 'credito_entrada' } })).toBe(1);
  });

  it('editarItemPendente altera os campos; após produção não deixa mais editar', async () => {
    const aluno = await criarUsuario();
    const atendente = await criarAtendente(Papel.atendente_entrada, 'barroca');
    const pend = await registrarEntrada(prisma, { alunoId: aluno.id, atendenteId: atendente.id, unidade: 'barroca', nome: 'Livro', categoria: 'Livros', valor: 10 });

    const editado = await editarItemPendente(prisma, { id: pend.id, nome: 'Livro Editado', categoria: 'Outros', valor: 15, quantidade: 2, unidade: 'floresta', descricao: 'novo' });
    expect(editado).toMatchObject({ nome: 'Livro Editado', categoria: 'Outros', valor: 15, quantidade: 2, unidade: 'floresta', descricao: 'novo' });

    await colocarEmProducao(prisma, { pendenteId: pend.id });
    await expect(
      editarItemPendente(prisma, { id: pend.id, nome: 'x', categoria: 'Outros', valor: 1, quantidade: 1, unidade: 'barroca' }),
    ).rejects.toMatchObject({ code: 'ITEM_NAO_PENDENTE' });
  });

  it('corrida: dois pushes simultâneos de pendentes iguais somam sem colidir', async () => {
    const aluno = await criarUsuario({ saldo: 0 });
    const atendente = await criarAtendente(Papel.atendente_entrada, 'barroca');
    const comum = { alunoId: aluno.id, atendenteId: atendente.id, unidade: 'barroca' as const, nome: 'Régua', categoria: 'Papelaria', valor: 3 };
    const p1 = await registrarEntrada(prisma, comum);
    const p2 = await registrarEntrada(prisma, comum);

    await Promise.all([
      colocarEmProducao(prisma, { pendenteId: p1.id }),
      colocarEmProducao(prisma, { pendenteId: p2.id }),
    ]);

    expect(await prisma.item.count({ where: { nome: 'Régua' } })).toBe(1);
    expect((await prisma.item.findFirstOrThrow({ where: { nome: 'Régua' } })).quantidade).toBe(2);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: aluno.id } })).saldo).toBe(6);
  });
});
