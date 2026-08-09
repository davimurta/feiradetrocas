import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ItensPendentes } from '@/components/entrada/ItensPendentes';
import type { ItemPendenteView } from '@/server/queries';

const agora = Date.now();

const livro: ItemPendenteView = {
  id: 'p1',
  codigo: 'ITM-AAAA',
  nome: 'Livro de Física',
  categoria: 'Livros',
  valor: 12,
  quantidade: 2,
  unidade: 'barroca',
  descricao: 'seminovo',
  alunoNome: 'Ana Souza',
  alunoMatricula: '10240099',
  createdAt: new Date(agora - 30 * 60_000),
};

const caneca: ItemPendenteView = {
  id: 'p2',
  codigo: 'ITM-BBBB',
  nome: 'Caneca',
  categoria: 'Utilidades',
  valor: 3,
  quantidade: 1,
  unidade: 'floresta',
  descricao: null,
  alunoNome: 'Bruno Lima',
  alunoMatricula: '20240001',
  createdAt: new Date(agora - 5 * 60_000),
};

function props(over: Partial<React.ComponentProps<typeof ItensPendentes>> = {}) {
  return {
    itens: [livro, caneca],
    unidade: '' as const,
    onUnidade: vi.fn(),
    onPush: vi.fn(),
    onPushTodos: vi.fn(),
    onPushSelecionados: vi.fn(),
    onEditar: vi.fn(async () => true),
    busyId: null,
    pushingAll: false,
    msg: null,
    ...over,
  };
}

const linhaDe = (nome: string) => screen.getByText(nome).closest('tr')!;

describe('ItensPendentes (fila da recepção)', () => {
  it('a linha mostra item, dono e total sem precisar abrir nada', () => {
    render(<ItensPendentes {...props()} />);

    const linha = linhaDe('Livro de Física');
    expect(within(linha).getByText('Ana Souza')).toBeInTheDocument();
    expect(within(linha).getByText('10240099')).toBeInTheDocument();
    expect(within(linha).getByText('ITM-AAAA', { exact: false })).toBeInTheDocument();
    // 12 fichas × 2 unidades: o total é o que vai ser creditado.
    expect(within(linha).getByText('24')).toBeInTheDocument();
    expect(within(linha).getByText('há 30 min')).toBeInTheDocument();
  });

  it('o resumo soma as fichas a creditar e os alunos na fila', () => {
    render(<ItensPendentes {...props()} />);

    expect(screen.getByText('Fichas a creditar').previousSibling).toHaveTextContent('27');
    expect(screen.getByText('Alunos aguardando').previousSibling).toHaveTextContent('2');
  });

  it('filtra por matrícula do aluno', async () => {
    const user = userEvent.setup();
    render(<ItensPendentes {...props()} />);

    await user.type(screen.getByLabelText('Filtrar itens pendentes'), '20240001');

    expect(screen.getByText('Caneca')).toBeInTheDocument();
    expect(screen.queryByText('Livro de Física')).not.toBeInTheDocument();
  });

  it('ordena por maior valor', async () => {
    const user = userEvent.setup();
    render(<ItensPendentes {...props()} />);

    await user.selectOptions(screen.getByLabelText('Ordenar por'), 'valor');

    const nomes = screen.getAllByTestId('pendente-linha').map((tr) => within(tr).getByText(/Livro de Física|Caneca/).textContent);
    expect(nomes).toEqual(['Livro de Física', 'Caneca']);
  });

  it('selecionar itens revela a barra de lote e envia só os marcados', async () => {
    const user = userEvent.setup();
    const onPushSelecionados = vi.fn();
    render(<ItensPendentes {...props({ onPushSelecionados })} />);

    await user.click(screen.getByLabelText('Selecionar Caneca'));

    const barra = screen.getByRole('region', { name: 'Ações da seleção' });
    expect(barra).toHaveTextContent('1 selecionado');
    expect(barra).toHaveTextContent('3 fichas');

    await user.click(within(barra).getByRole('button', { name: /Produzir selecionados/ }));
    expect(onPushSelecionados).toHaveBeenCalledWith(['p2']);
  });

  it('"selecionar todos" marca apenas o que está visível no filtro', async () => {
    const user = userEvent.setup();
    const onPushSelecionados = vi.fn();
    render(<ItensPendentes {...props({ onPushSelecionados })} />);

    await user.type(screen.getByLabelText('Filtrar itens pendentes'), 'Livro');
    await user.click(screen.getByLabelText('Selecionar todos os itens visíveis'));
    await user.click(screen.getByRole('button', { name: /Produzir selecionados/ }));

    expect(onPushSelecionados).toHaveBeenCalledWith(['p1']);
  });

  it('editar abre o formulário da linha e salva os campos', async () => {
    const user = userEvent.setup();
    const onEditar = vi.fn(async () => true);
    render(<ItensPendentes {...props({ onEditar })} />);

    await user.click(within(linhaDe('Livro de Física')).getByRole('button', { name: /Editar/ }));

    const nome = screen.getByLabelText('Nome do item');
    await user.clear(nome);
    await user.type(nome, 'Livro Editado');
    await user.click(screen.getByRole('button', { name: /Salvar/ }));

    expect(onEditar).toHaveBeenCalledWith('p1', {
      nome: 'Livro Editado',
      categoria: 'Livros',
      valor: 12,
      quantidade: 2,
      unidade: 'barroca',
      descricao: 'seminovo',
    });
  });

  it('Esc fecha a edição sem salvar', async () => {
    const user = userEvent.setup();
    const onEditar = vi.fn(async () => true);
    render(<ItensPendentes {...props({ onEditar })} />);

    await user.click(within(linhaDe('Livro de Física')).getByRole('button', { name: /Editar/ }));
    await user.type(screen.getByLabelText('Nome do item'), ' rasurado');
    await user.keyboard('{Escape}');

    expect(onEditar).not.toHaveBeenCalled();
    expect(screen.queryByLabelText('Nome do item')).not.toBeInTheDocument();
    expect(screen.getByText('Livro de Física')).toBeInTheDocument();
  });

  it('salvar fica bloqueado enquanto nada mudou', async () => {
    const user = userEvent.setup();
    render(<ItensPendentes {...props()} />);

    await user.click(within(linhaDe('Caneca')).getByRole('button', { name: /Editar/ }));
    expect(screen.getByRole('button', { name: /Salvar/ })).toBeDisabled();
  });

  it('push individual chama onPush com o id da linha', async () => {
    const user = userEvent.setup();
    const onPush = vi.fn();
    render(<ItensPendentes {...props({ onPush })} />);

    await user.click(within(linhaDe('Caneca')).getByRole('button', { name: /Produzir/ }));
    expect(onPush).toHaveBeenCalledWith('p2');
  });

  it('"Produzir tudo" chama onPushTodos', async () => {
    const user = userEvent.setup();
    const onPushTodos = vi.fn();
    render(<ItensPendentes {...props({ onPushTodos })} />);

    await user.click(screen.getByRole('button', { name: /Produzir tudo/ }));
    expect(onPushTodos).toHaveBeenCalled();
  });

  it('fila vazia e busca sem resultado têm mensagens diferentes', async () => {
    const user = userEvent.setup();
    const { unmount } = render(<ItensPendentes {...props({ itens: [] })} />);
    expect(screen.getByText(/Fila vazia/)).toBeInTheDocument();
    unmount();

    render(<ItensPendentes {...props()} />);
    await user.type(screen.getByLabelText('Filtrar itens pendentes'), 'zzzz');
    expect(screen.getByText(/Nenhum item corresponde/)).toBeInTheDocument();
  });

  it('mostra a mensagem de resultado quando fornecida', () => {
    render(<ItensPendentes {...props({ msg: { ok: true, texto: 'Livro em produção · +12 fichas.' } })} />);
    expect(screen.getByRole('status')).toHaveTextContent(/em produção/);
  });
});
