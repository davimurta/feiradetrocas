import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('@/app/actions/admin', () => ({
  metricasAction: vi.fn(),
}));

import { AdminMetricas } from '@/components/admin/AdminMetricas';
import { metricasAction } from '@/app/actions/admin';
import type { MetricasView } from '@/server/metricas';

function metricas(over: Partial<MetricasView> = {}): MetricasView {
  return {
    filtro: {
      de: '2026-08-01T00:00:00.000Z',
      ate: '2026-08-08T00:00:00.000Z',
      unidade: null,
      granularidade: 'dia',
    },
    kpis: {
      transacoes: 42,
      fichasEmCirculacao: 310,
      itensEmEstoque: 18,
      valorEstoque: 90,
      produtosDistintos: 7,
      itensEsgotados: 2,
      usuarios: 25,
      alunos: 20,
      alunosBloqueados: 1,
      contasPendentes: 3,
    },
    serie: [{ balde: '2026-08-01 00:00', transacoes: 5, creditos: 30, debitos: 12 }],
    fichas: { emitidas: 500, gastas: 190, ajustes: 10, emCirculacao: 310 },
    rankingItens: [
      { id: 'i1', nome: 'Livro', categoria: 'Livros', unidade: 'barroca', unidades: 4, fichas: 20 },
    ],
    atendentes: [
      {
        id: 'a1',
        nome: 'Marina',
        papel: 'atendente_entrada',
        recebidos: 6,
        creditados: 5,
        fichasCreditadas: 50,
        pedidosCriados: 0,
        pedidosAprovados: 0,
        fichasVendidas: 0,
      },
    ],
    pedidos: {
      porStatus: [
        { label: 'aprovado', value: 8 },
        { label: 'pendente', value: 1 },
        { label: 'recusado', value: 2 },
        { label: 'cancelado', value: 0 },
      ],
      total: 11,
      taxaRecusa: 0.2,
      segundosMedioAprovacao: 45,
    },
    fila: { pendentes: 4, emProducao: 12, segundosMedioAtePush: 120 },
    reportesPorMotivo: [{ label: 'recusa indevida', value: 2 }],
    discrepancias: [
      { label: 'preco_discrepante', pendentes: 1, catalogo: 2 },
      { label: 'preco_zero', pendentes: 0, catalogo: 0 },
    ],
    categorias: [{ label: 'Livros', estoque: 18, vendidos: 4 }],
    distribuicaoSaldo: [{ label: '1–5', value: 9 }],
    ...over,
  };
}

const recentes = [
  {
    id: 't1',
    tipo: 'credito_entrada',
    valor: 10,
    createdAt: new Date('2026-08-07T12:00:00Z'),
    usuarioNome: 'Ana',
    itemNome: 'Livro',
  },
];

describe('AdminMetricas', () => {
  beforeEach(() => vi.clearAllMocks());

  it('mostra os KPIs do servidor sem refazer a consulta no mount', () => {
    render(<AdminMetricas inicial={metricas()} recentes={recentes} />);

    expect(screen.getByText('Transações no período').previousSibling).toHaveTextContent('42');
    expect(screen.getByText('Fichas emitidas').previousSibling).toHaveTextContent('500');
    expect(screen.getByText('Fichas gastas').previousSibling).toHaveTextContent('190');
    // O primeiro render já veio pronto do RSC — refazer aqui seria uma consulta duplicada.
    expect(metricasAction).not.toHaveBeenCalled();
  });

  it('trocar o período consulta o servidor de novo (nada é reagregado no client)', async () => {
    const user = userEvent.setup();
    vi.mocked(metricasAction).mockResolvedValue({
      ok: true,
      data: {
        metricas: metricas({
          kpis: { ...metricas().kpis, transacoes: 77 },
        }),
        recentes: [],
      },
    });

    render(<AdminMetricas inicial={metricas()} recentes={recentes} />);
    await user.selectOptions(screen.getByLabelText('Período'), '24h');

    expect(metricasAction).toHaveBeenCalledWith(expect.objectContaining({ periodo: '24h' }));
    expect(await screen.findByText('77')).toBeInTheDocument();
  });

  it('período personalizado revela os campos de data e os envia', async () => {
    const user = userEvent.setup();
    vi.mocked(metricasAction).mockResolvedValue({
      ok: true,
      data: { metricas: metricas(), recentes: [] },
    });

    render(<AdminMetricas inicial={metricas()} recentes={recentes} />);
    await user.selectOptions(screen.getByLabelText('Período'), 'custom');

    const de = screen.getByLabelText('De');
    await user.type(de, '2026-08-01T08:00');

    expect(metricasAction).toHaveBeenLastCalledWith(
      expect.objectContaining({ periodo: 'custom', de: '2026-08-01T08:00' }),
    );
  });

  it('a granularidade escolhida vai junto na consulta', async () => {
    const user = userEvent.setup();
    vi.mocked(metricasAction).mockResolvedValue({
      ok: true,
      data: { metricas: metricas(), recentes: [] },
    });

    render(<AdminMetricas inicial={metricas()} recentes={recentes} />);
    await user.selectOptions(screen.getByLabelText('Granularidade'), 'hora');

    expect(metricasAction).toHaveBeenCalledWith(expect.objectContaining({ granularidade: 'hora' }));
  });

  it('os links de exportação carregam o filtro e a unidade vigentes', async () => {
    const user = userEvent.setup();
    vi.mocked(metricasAction).mockResolvedValue({
      ok: true,
      data: { metricas: metricas(), recentes: [] },
    });

    render(<AdminMetricas inicial={metricas()} recentes={recentes} unidade="floresta" />);
    await user.selectOptions(screen.getByLabelText('Período'), '30d');

    const planilha = screen.getByRole('link', { name: /Exportar planilha/ });
    expect(planilha).toHaveAttribute(
      'href',
      '/admin/export?periodo=30d&unidade=floresta&formato=xlsx&dataset=tudo',
    );

    const menu = screen.getByText('Exportar um dataset em CSV').parentElement!;
    expect(within(menu).getByRole('link', { name: 'Transações' })).toHaveAttribute(
      'href',
      '/admin/export?periodo=30d&unidade=floresta&formato=csv&dataset=transacoes',
    );
  });

  it('erro do servidor aparece na tela em vez de sumir', async () => {
    const user = userEvent.setup();
    vi.mocked(metricasAction).mockResolvedValue({
      ok: false,
      error: { code: 'REDE', message: 'Falha de rede.' },
    });

    render(<AdminMetricas inicial={metricas()} recentes={recentes} />);
    await user.selectOptions(screen.getByLabelText('Período'), 'tudo');

    expect(await screen.findByRole('alert')).toHaveTextContent('Falha de rede.');
  });
});
