import { it, expect } from 'vitest';
import { Papel } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { receberItem } from '@/domain/entrada';
import { describeDb } from '../helpers/db';
import { criarUsuario, criarAtendente } from '../helpers/factories';

describeDb('receberItem (integração, Postgres real)', () => {
  it('cria item novo na unidade, credita o aluno e lança no extrato', async () => {
    const aluno = await criarUsuario({ saldo: 0 });
    const atendente = await criarAtendente(Papel.atendente_entrada, 'barroca');

    const res = await receberItem(prisma, {
      alunoId: aluno.id,
      atendenteId: atendente.id,
      unidade: 'barroca',
      nome: 'Livro de História',
      categoria: 'Livros',
      valor: 20,
    });

    expect(res.novo).toBe(true);
    const item = await prisma.item.findUniqueOrThrow({ where: { id: res.item.id } });
    expect(item.quantidade).toBe(1);
    expect(item.unidade).toBe('barroca');

    const noBanco = await prisma.user.findUniqueOrThrow({ where: { id: aluno.id } });
    expect(noBanco.saldo).toBe(20);
    expect(await prisma.transacao.count({ where: { userId: aluno.id, tipo: 'credito_entrada' } })).toBe(1);
  });

  it('stacking por unidade: mesmo nome+valor na mesma unidade incrementa; em outra unidade cria novo', async () => {
    const aluno = await criarUsuario();
    const atendente = await criarAtendente(Papel.atendente_entrada);
    const comum = { alunoId: aluno.id, atendenteId: atendente.id, nome: 'Caneta', categoria: 'Papelaria', valor: 2 };

    const a = await receberItem(prisma, { ...comum, unidade: 'barroca' });
    const b = await receberItem(prisma, { ...comum, unidade: 'barroca' });
    const c = await receberItem(prisma, { ...comum, unidade: 'floresta' });

    expect(a.item.id).toBe(b.item.id); // stack na barroca
    expect(c.item.id).not.toBe(a.item.id); // floresta é outro item

    const barroca = await prisma.item.findUniqueOrThrow({ where: { id: a.item.id } });
    const floresta = await prisma.item.findUniqueOrThrow({ where: { id: c.item.id } });
    expect(barroca.quantidade).toBe(2);
    expect(floresta.quantidade).toBe(1);
    expect(await prisma.item.count({ where: { nome: 'Caneta' } })).toBe(2);
  });

  it('aluno inexistente → ALUNO_INEXISTENTE (nada persiste)', async () => {
    const atendente = await criarAtendente(Papel.atendente_entrada);
    await expect(
      receberItem(prisma, { alunoId: 'nao-existe', atendenteId: atendente.id, unidade: 'barroca', nome: 'X', categoria: 'Outros', valor: 5 }),
    ).rejects.toMatchObject({ code: 'ALUNO_INEXISTENTE' });
    expect(await prisma.item.count()).toBe(0);
  });
});
