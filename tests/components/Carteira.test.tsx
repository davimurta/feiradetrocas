import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('@/app/actions/pedido', () => ({
  aprovarPedidoAction: vi.fn(),
  recusarPedidoAction: vi.fn(),
}));

vi.mock('@/app/actions/carteira', () => ({
  sincronizarCarteiraAction: vi.fn(async () => ({
    ok: true,
    data: { saldo: 50, historico: [], pendentes: [] },
  })),
}));

import { Carteira } from '@/components/carteira/Carteira';
import { aprovarPedidoAction, recusarPedidoAction } from '@/app/actions/pedido';
import { sincronizarCarteiraAction } from '@/app/actions/carteira';
import type { PedidoPendenteView } from '@/server/queries';

const pendente: PedidoPendenteView = {
  id: 'p1',
  itemNome: 'Livro',
  valor: 10,
  atendenteNome: 'Diego',
  unidade: 'barroca',
  descricao: 'capa dura',
  createdAt: new Date(),
};

const base = { nome: 'Ana Souza', saldo: 50, codigoCarteira: '20240001', historico: [], pendentes: [pendente] };

describe('Carteira (aprovação em tela cheia)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('mostra a tela de aprovação com item, descrição e saldo', () => {
    render(<Carteira {...base} />);
    expect(screen.getByRole('dialog', { name: /Aprovar compra/ })).toBeInTheDocument();
    expect(screen.getByText('Livro')).toBeInTheDocument();
    expect(screen.getByText('capa dura')).toBeInTheDocument();
    expect(screen.getByTestId('saldo-valor')).toHaveTextContent('50');
  });

  it('aceitar: 1 requisição, atualiza saldo e histórico na hora (sem refresh)', async () => {
    const user = userEvent.setup();
    vi.mocked(aprovarPedidoAction).mockResolvedValue({ ok: true, data: { saldoAtual: 40, restante: 2, valor: 10, itemNome: 'Livro' } });
    render(<Carteira {...base} />);

    await user.click(screen.getByRole('button', { name: /Aceitar/ }));

    expect(aprovarPedidoAction).toHaveBeenCalledTimes(1);
    expect(await screen.findByRole('status')).toHaveTextContent(/Compra aprovada/);
    expect(screen.getByTestId('saldo-valor')).toHaveTextContent('40');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByText('Livro')).toBeInTheDocument();
  });

  it('recusar fecha a tela e mostra aviso', async () => {
    const user = userEvent.setup();
    vi.mocked(recusarPedidoAction).mockResolvedValue({ ok: true, data: { ok: true } });
    render(<Carteira {...base} />);

    await user.click(screen.getByRole('button', { name: /Recusar/ }));
    expect(recusarPedidoAction).toHaveBeenCalledWith({ pedidoId: 'p1' });
    expect(await screen.findByText('Compra recusada.')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('erro na aprovação mostra mensagem específica', async () => {
    const user = userEvent.setup();
    vi.mocked(aprovarPedidoAction).mockResolvedValue({ ok: false, error: { code: 'SALDO_INSUFICIENTE', message: 'x' } });
    render(<Carteira {...base} />);

    await user.click(screen.getByRole('button', { name: /Aceitar/ }));
    expect(await screen.findByText('Saldo insuficiente para esta compra.')).toBeInTheDocument();
  });

  it('crédito feito pela recepção chega sozinho, sem F5', async () => {
    vi.mocked(sincronizarCarteiraAction).mockResolvedValue({
      ok: true,
      data: {
        saldo: 65,
        historico: [
          { id: 't1', tipo: 'credito_entrada', valor: 15, quantidade: 1, createdAt: new Date(), itemNome: 'Livro' },
        ],
        pendentes: [],
      },
    });
    render(<Carteira {...base} pendentes={[]} />);
    expect(screen.getByTestId('saldo-valor')).toHaveTextContent('50');

    // Voltar o foco força a sincronização na hora, sem esperar o tick do polling.
    await act(async () => {
      window.dispatchEvent(new Event('focus'));
    });

    expect(screen.getByTestId('saldo-valor')).toHaveTextContent('65');
    expect(screen.getByRole('status')).toHaveTextContent('+15 fichas creditadas');
    expect(screen.getByText('Livro')).toBeInTheDocument();
  });

  it('aba em segundo plano não consulta o servidor; ao voltar, consulta', async () => {
    vi.mocked(sincronizarCarteiraAction).mockResolvedValue({
      ok: true,
      data: { saldo: 50, historico: [], pendentes: [] },
    });
    render(<Carteira {...base} pendentes={[]} />);

    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(sincronizarCarteiraAction).not.toHaveBeenCalled();

    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(sincronizarCarteiraAction).toHaveBeenCalledTimes(1);
  });

  it('proposta que chega fecha o QR aberto e trava os botões', async () => {
    const user = userEvent.setup();
    vi.mocked(sincronizarCarteiraAction).mockResolvedValue({
      ok: true,
      data: { saldo: 50, historico: [], pendentes: [pendente] },
    });
    render(<Carteira {...base} pendentes={[]} />);

    await user.click(screen.getByRole('button', { name: /Exibir QRcode/ }));
    expect(screen.getByRole('dialog', { name: 'Sua carteira' })).toBeInTheDocument();

    // Chega a proposta (o stand montou o pedido enquanto o aluno olhava o QR).
    await act(async () => {
      window.dispatchEvent(new Event('focus'));
    });

    expect(screen.queryByRole('dialog', { name: 'Sua carteira' })).not.toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: /Aprovar compra/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Exibir QRcode/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Fazer tutorial/ })).toBeDisabled();
  });

  it('o tutorial aberto também sai da frente da proposta', async () => {
    const user = userEvent.setup();
    vi.mocked(sincronizarCarteiraAction).mockResolvedValue({
      ok: true,
      data: { saldo: 50, historico: [], pendentes: [pendente] },
    });
    render(<Carteira {...base} pendentes={[]} />);

    await user.click(screen.getByRole('button', { name: /Fazer tutorial/ }));
    const tutorial = screen.getAllByRole('dialog').find((d) => d.textContent?.includes('recepção'));
    expect(tutorial).toBeDefined();

    await act(async () => {
      window.dispatchEvent(new Event('focus'));
    });

    const dialogos = screen.getAllByRole('dialog');
    expect(dialogos).toHaveLength(1);
    expect(dialogos[0]).toHaveAccessibleName(/Aprovar compra/);
  });

  it('resolvida a proposta, os botões voltam sem reabrir o QR sozinho', async () => {
    const user = userEvent.setup();
    vi.mocked(recusarPedidoAction).mockResolvedValue({ ok: true, data: { ok: true } });
    render(<Carteira {...base} />);

    await user.click(screen.getByRole('button', { name: /Recusar/ }));

    expect(screen.getByRole('button', { name: /Exibir QRcode/ })).toBeEnabled();
    expect(screen.queryByRole('dialog', { name: 'Sua carteira' })).not.toBeInTheDocument();
  });

  it('a sincronização não desfaz o saldo de uma aprovação em voo', async () => {
    const user = userEvent.setup();
    vi.mocked(aprovarPedidoAction).mockResolvedValue({
      ok: true,
      data: { saldoAtual: 40, restante: 2, valor: 10, itemNome: 'Livro' },
    });
    // Servidor ainda devolvendo o estado antigo (a transação acabou de ser gravada).
    vi.mocked(sincronizarCarteiraAction).mockResolvedValue({
      ok: true,
      data: { saldo: 50, historico: [], pendentes: [pendente] },
    });
    render(<Carteira {...base} />);

    await user.click(screen.getByRole('button', { name: /Aceitar/ }));
    expect(screen.getByTestId('saldo-valor')).toHaveTextContent('40');
  });
});
