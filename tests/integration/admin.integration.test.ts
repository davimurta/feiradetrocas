import { it, expect } from 'vitest';
import { prisma } from '@/lib/prisma';
import { ajustarSaldo } from '@/domain/admin';
import { registrarEntrada, colocarEmProducao } from '@/domain/entrada';
import { criarPedido, aprovarPedido } from '@/domain/pedido';
import { getMetricas } from '@/server/metricas';
import { resolverFiltro } from '@/lib/filtroMetricas';
import { describeDb } from '../helpers/db';
import { criarUsuario, criarAtendente, criarItem } from '../helpers/factories';

const janela = () => resolverFiltro({ periodo: '7d' });

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

  it('getMetricas reflete KPIs, estoque e distribuição de saldo', async () => {
    const u = await criarUsuario({ saldo: 30 });
    await criarItem({ categoria: 'Livros', valor: 2, quantidade: 4 });
    await ajustarSaldo(prisma, { userId: u.id, novoSaldo: 40 });

    const m = await getMetricas(janela());

    expect(m.kpis.fichasEmCirculacao).toBe(40);
    expect(m.kpis.itensEmEstoque).toBe(4);
    expect(m.kpis.valorEstoque).toBe(8); // 2 fichas × 4 unidades
    expect(m.fichas.ajustes).toBe(10);
    expect(m.categorias.some((c) => c.label === 'Livros' && c.estoque === 4)).toBe(true);
    expect(m.distribuicaoSaldo.find((f) => f.label === '21–50')?.value).toBe(1);
  });

  it('a série temporal cobre a janela inteira, inclusive baldes vazios', async () => {
    const m = await getMetricas(resolverFiltro({ periodo: '7d', granularidade: 'dia' }));
    expect(m.filtro.granularidade).toBe('dia');
    expect(m.serie.length).toBeGreaterThanOrEqual(7);
    expect(m.serie.every((p) => typeof p.transacoes === 'number')).toBe(true);
  });

  it('conta ajuste_manual mesmo filtrando por unidade (transação sem item)', async () => {
    const u = await criarUsuario({ saldo: 0, unidade: 'floresta' });
    await ajustarSaldo(prisma, { userId: u.id, novoSaldo: 12 });

    const m = await getMetricas(resolverFiltro({ periodo: '7d', unidade: 'floresta' }));

    // O INNER JOIN em items descartaria este ajuste, ele não tem item.
    expect(m.kpis.transacoes).toBe(1);
    expect(m.fichas.ajustes).toBe(12);
    expect(m.serie.reduce((s, p) => s + p.transacoes, 0)).toBe(1);
  });

  it('ranking, atendentes e pedidos saem agregados do fluxo real', async () => {
    const aluno = await criarUsuario({ saldo: 0 });
    const comprador = await criarUsuario({ saldo: 100 });
    const recepcao = await criarAtendente('atendente_entrada');
    const stand = await criarAtendente('atendente_stand');

    const pendente = await registrarEntrada(prisma, {
      alunoId: aluno.id,
      atendenteId: recepcao.id,
      nome: 'Livro de História',
      categoria: 'Livros',
      valor: 5,
      quantidade: 2,
      unidade: 'barroca',
    });
    await colocarEmProducao(prisma, { pendenteId: pendente.id });

    const item = await prisma.item.findFirstOrThrow({ where: { nome: 'Livro de História' } });
    const pedido = await criarPedido(prisma, {
      itemId: item.id,
      compradorId: comprador.id,
      atendenteId: stand.id,
      unidade: 'barroca',
    });
    await aprovarPedido(prisma, { pedidoId: pedido.pedidoId, compradorId: comprador.id });

    const m = await getMetricas(janela());

    expect(m.rankingItens[0]).toMatchObject({ nome: 'Livro de História', unidades: 1 });

    const daRecepcao = m.atendentes.find((a) => a.id === recepcao.id);
    expect(daRecepcao).toMatchObject({ recebidos: 1, creditados: 1 });

    const doStand = m.atendentes.find((a) => a.id === stand.id);
    expect(doStand).toMatchObject({ pedidosCriados: 1, pedidosAprovados: 1 });

    expect(m.pedidos.porStatus.find((s) => s.label === 'aprovado')?.value).toBe(1);
    expect(m.pedidos.taxaRecusa).toBe(0);
    expect(m.fila.emProducao).toBe(1);
    expect(m.fichas.emitidas).toBe(10); // 5 fichas × 2 unidades
    expect(m.fichas.gastas).toBe(5);
  });
});
