import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('@/app/actions/entrada', () => ({
  receberItemAction: vi.fn(),
  buscarItensPorNomeAction: vi.fn(async () => ({ ok: true, data: [] })),
  buscarAlunoAction: vi.fn(async () => ({ ok: true, data: null })),
  listarPendentesAction: vi.fn(async () => ({ ok: true, data: [] })),
  pushProducaoAction: vi.fn(),
  pushTodosProducaoAction: vi.fn(),
  editarPendenteAction: vi.fn(),
  alertasPendentesAction: vi.fn(async () => ({ ok: true, data: [] })),
}));

import { EntradaConsole } from '@/components/entrada/EntradaConsole';
import {
  receberItemAction,
  pushProducaoAction,
  editarPendenteAction,
  pushTodosProducaoAction,
  listarPendentesAction,
} from '@/app/actions/entrada';
import type { ItemPendenteView } from '@/server/queries';

const jaPendente: ItemPendenteView = {
  id: 'p1',
  codigo: 'ITM-A',
  nome: 'Caneta',
  categoria: 'Papelaria',
  valor: 2,
  quantidade: 1,
  unidade: 'barroca',
  descricao: null,
  alunoNome: 'Bruno',
  alunoMatricula: '10240001',
  createdAt: new Date(),
};

describe('EntradaConsole (sincronização cadastro ↔ pendentes)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('cadastrar um item o faz aparecer na aba de pendentes na hora (sem F5)', async () => {
    const user = userEvent.setup();
    vi.mocked(receberItemAction).mockResolvedValue({
      ok: true,
      data: {
        id: 'p9',
        codigo: 'ITM-Z',
        nome: 'Livro Novo',
        categoria: 'Livros',
        valor: 12,
        quantidade: 1,
        unidade: 'barroca',
        descricao: null,
        alunoNome: 'Ana',
        alunoMatricula: '10240099',
        alunoCriado: false,
      },
    });
    render(<EntradaConsole unidadePadrao="barroca" pendentesIniciais={[]} alertasIniciais={[]} />);

    await user.type(screen.getByLabelText('Matrícula do aluno'), '10240099');
    await user.type(screen.getByLabelText('Nome do item'), 'Livro Novo');
    await user.type(screen.getByLabelText('Valor (fichas)'), '12');
    await user.click(screen.getByRole('button', { name: 'Cadastrar' }));

    const tabPendentes = await screen.findByRole('tab', { name: /Itens pendentes/ });
    expect(tabPendentes).toHaveTextContent('1');

    await user.click(tabPendentes);
    expect(screen.getByText('Livro Novo')).toBeInTheDocument();
    expect(screen.getByText('10240099')).toBeInTheDocument();
  });

  it('push remove o item e atualiza o contador da aba', async () => {
    const user = userEvent.setup();
    vi.mocked(pushProducaoAction).mockResolvedValue({
      ok: true,
      data: { item: { id: 'i1', codigo: 'ITM-A', nome: 'Caneta', categoria: 'Papelaria', valor: 2, quantidade: 1 }, creditado: 2, saldoAtual: 2, alunoNome: 'Bruno', transacaoId: 't1', novo: true },
    });
    render(<EntradaConsole unidadePadrao="barroca" pendentesIniciais={[jaPendente]} alertasIniciais={[]} />);

    await user.click(screen.getByRole('tab', { name: /Itens pendentes/ }));
    const linha = screen.getByText('Caneta').closest('tr')!;
    await user.click(within(linha).getByRole('button', { name: /Produzir/ }));

    expect(pushProducaoAction).toHaveBeenCalledWith({ id: 'p1' });
    expect(await screen.findByRole('status')).toHaveTextContent(/em produção/);
    expect(screen.queryByText('Caneta')).not.toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Itens pendentes/ })).not.toHaveTextContent('1');
  });

  it('editar um pendente chama a action e mostra confirmação', async () => {
    const user = userEvent.setup();
    vi.mocked(editarPendenteAction).mockResolvedValue({
      ok: true,
      data: { id: 'p1', codigo: 'ITM-A', nome: 'Caneta Azul', categoria: 'Papelaria', valor: 2, quantidade: 1, unidade: 'barroca', descricao: null },
    });
    render(<EntradaConsole unidadePadrao="barroca" pendentesIniciais={[jaPendente]} alertasIniciais={[]} />);

    await user.click(screen.getByRole('tab', { name: /Itens pendentes/ }));
    const linha = screen.getByText('Caneta').closest('tr')!;
    await user.click(within(linha).getByRole('button', { name: /Editar/ }));

    const nome = screen.getByLabelText('Nome do item');
    await user.clear(nome);
    await user.type(nome, 'Caneta Azul');
    await user.click(screen.getByRole('button', { name: /Salvar/ }));

    expect(editarPendenteAction).toHaveBeenCalledWith(expect.objectContaining({ id: 'p1', nome: 'Caneta Azul' }));
    expect(await screen.findByRole('status')).toHaveTextContent(/atualizado/);
  });

  it('produzir em lote remove só os ids confirmados pelo servidor, sem refetch', async () => {
    const user = userEvent.setup();
    const outro: ItemPendenteView = { ...jaPendente, id: 'p2', codigo: 'ITM-B', nome: 'Borracha' };
    vi.mocked(pushTodosProducaoAction).mockResolvedValue({
      ok: true,
      data: { total: 1, creditadoTotal: 2, falhas: 1, idsOk: ['p1'] },
    });
    render(<EntradaConsole unidadePadrao="barroca" pendentesIniciais={[jaPendente, outro]} alertasIniciais={[]} />);

    await user.click(screen.getByRole('tab', { name: /Itens pendentes/ }));
    await user.click(screen.getByLabelText('Selecionar Caneta'));
    await user.click(screen.getByRole('button', { name: /Produzir selecionados/ }));

    expect(pushTodosProducaoAction).toHaveBeenCalledWith({ unidade: undefined, ids: ['p1'] });
    expect(await screen.findByRole('status')).toHaveTextContent('1 itens em produção');
    expect(screen.queryByText('Caneta')).not.toBeInTheDocument();
    expect(screen.getByText('Borracha')).toBeInTheDocument();
    // A lista foi acertada com o retorno da própria action — nada de segunda consulta.
    expect(listarPendentesAction).not.toHaveBeenCalled();
  });
});
