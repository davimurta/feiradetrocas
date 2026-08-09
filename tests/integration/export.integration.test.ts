import { it, expect } from 'vitest';
import { prisma } from '@/lib/prisma';
import { ajustarSaldo } from '@/domain/admin';
import { registrarEntrada, colocarEmProducao } from '@/domain/entrada';
import { criarPedido, aprovarPedido } from '@/domain/pedido';
import { montarTabela, paraCsv, paraXlsx } from '@/server/export';
import { resolverFiltro } from '@/lib/filtroMetricas';
import { describeDb } from '../helpers/db';
import { criarUsuario, criarAtendente } from '../helpers/factories';

const janela = () => resolverFiltro({ periodo: '7d' });

/** Monta um ciclo completo: entrada → push → pedido → aprovação, mais um ajuste manual. */
async function cenario() {
  const aluno = await criarUsuario({ nome: 'Ana Aluna' });
  const comprador = await criarUsuario({ nome: 'Bruno Comprador', saldo: 50 });
  const recepcao = await criarAtendente('atendente_entrada');
  const stand = await criarAtendente('atendente_stand');

  const pendente = await registrarEntrada(prisma, {
    alunoId: aluno.id,
    atendenteId: recepcao.id,
    nome: 'Caneca',
    categoria: 'Utilidades',
    valor: 4,
    quantidade: 3,
    unidade: 'barroca',
  });
  await colocarEmProducao(prisma, { pendenteId: pendente.id });

  const item = await prisma.item.findFirstOrThrow({ where: { nome: 'Caneca' } });
  const pedido = await criarPedido(prisma, {
    itemId: item.id,
    compradorId: comprador.id,
    atendenteId: stand.id,
    unidade: 'barroca',
  });
  await aprovarPedido(prisma, { pedidoId: pedido.pedidoId, compradorId: comprador.id });
  await ajustarSaldo(prisma, { userId: aluno.id, novoSaldo: 100 });

  return { aluno, comprador };
}

describeDb('Exportação de métricas (integração, Postgres real)', () => {
  it('a aba de transações cobre crédito, débito e ajuste (inclusive sem item)', async () => {
    await cenario();
    const t = await montarTabela('transacoes', janela());

    expect(t.nome).toBe('Transações');
    const tipos = t.linhas.map((l) => l.tipo);
    expect(tipos).toContain('credito_entrada');
    expect(tipos).toContain('debito_compra');
    expect(tipos).toContain('ajuste_manual');

    const credito = t.linhas.find((l) => l.tipo === 'credito_entrada')!;
    expect(credito.participante).toBe('Ana Aluna');
    expect(credito.item).toBe('Caneca');
    expect(credito.valor).toBe(12); // 4 fichas × 3 unidades

    // O ajuste não tem item: a unidade cai para a do participante em vez de ficar vazia.
    const ajuste = t.linhas.find((l) => l.tipo === 'ajuste_manual')!;
    expect(ajuste.item).toBe('');
    expect(ajuste.unidade).toBe('barroca');
  });

  it('a aba de saldos traz saldo atual e o movimento agregado do período', async () => {
    const { aluno, comprador } = await cenario();
    const t = await montarTabela('saldos', janela());

    const linhaAluno = t.linhas.find((l) => l.matricula === aluno.codigoCarteira)!;
    expect(linhaAluno.saldo).toBe(100);
    expect(linhaAluno.creditado).toBe(12);
    expect(linhaAluno.ajustes).toBe(88); // 100 − 12

    const linhaComprador = t.linhas.find((l) => l.matricula === comprador.codigoCarteira)!;
    expect(linhaComprador.gasto).toBe(4);
    expect(linhaComprador.saldo).toBe(46);
  });

  it('a aba de itens junta catálogo e fila da recepção', async () => {
    await cenario();
    await registrarEntrada(prisma, {
      alunoId: (await criarUsuario()).id,
      atendenteId: (await criarAtendente('atendente_entrada')).id,
      nome: 'Mochila',
      categoria: 'Utilidades',
      valor: 7,
      unidade: 'barroca',
    });

    const t = await montarTabela('itens', janela());
    const catalogo = t.linhas.find((l) => l.nome === 'Caneca')!;
    expect(catalogo.origem).toBe('catálogo');
    expect(catalogo.quantidade).toBe(2); // 3 recebidas − 1 vendida
    expect(catalogo.total).toBe(8);

    const naFila = t.linhas.find((l) => l.nome === 'Mochila')!;
    expect(naFila.origem).toBe('recepção');
  });

  it('a aba de status traz o pedido resolvido com o tempo até a decisão', async () => {
    await cenario();
    const t = await montarTabela('status', janela());

    expect(t.linhas).toHaveLength(1);
    expect(t.linhas[0]).toMatchObject({
      status: 'aprovado',
      item: 'Caneca',
      comprador: 'Bruno Comprador',
      valor: 4,
    });
    expect(Number(t.linhas[0].segundos)).toBeGreaterThanOrEqual(0);
  });

  it('a aba de resumo repete os agregados do painel', async () => {
    await cenario();
    const t = await montarTabela('resumo', janela());
    const valor = (indicador: string) =>
      t.linhas.find((l) => l.indicador === indicador)?.valor;

    expect(valor('Fichas emitidas')).toBe(12);
    expect(valor('Fichas gastas')).toBe(4);
    expect(valor('Pedidos aprovado')).toBe(1);
    expect(valor('Taxa de recusa')).toBe('0.0%');
  });

  it('o filtro por unidade vale para a planilha, não só para o gráfico', async () => {
    await cenario();
    const t = await montarTabela('transacoes', resolverFiltro({ periodo: '7d', unidade: 'floresta' }));
    expect(t.linhas).toHaveLength(0);
  });

  it('gera .xlsx (zip válido) e .csv com cabeçalho', async () => {
    await cenario();
    const tabelas = await Promise.all([
      montarTabela('resumo', janela()),
      montarTabela('transacoes', janela()),
    ]);

    const xlsx = await paraXlsx(tabelas);
    expect(xlsx.length).toBeGreaterThan(1000);
    expect(xlsx.subarray(0, 2).toString('ascii')).toBe('PK'); // assinatura de zip

    const csv = paraCsv(tabelas[1]);
    expect(csv).toContain('ID;Data/hora;Tipo;Fichas');
    expect(csv.split('\r\n').length).toBeGreaterThan(2);
  });
});
