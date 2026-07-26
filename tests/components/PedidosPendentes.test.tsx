import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// Mock dos módulos server-only para o componente client ser testável sem banco.
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock('@/app/actions/pedido', () => ({
  listarPedidosPendentesAction: vi.fn(async () => ({ ok: true, data: [] })),
  aprovarPedidoAction: vi.fn(),
  recusarPedidoAction: vi.fn(),
}));

import { PedidosPendentes } from '@/components/PedidosPendentes';
import { aprovarPedidoAction, recusarPedidoAction } from '@/app/actions/pedido';

const pedido = { id: 'p1', itemNome: 'Livro', valor: 10, atendenteNome: 'Diego', unidade: 'barroca', createdAt: new Date() };

describe('PedidosPendentes (aprovação do comprador)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('aprova → chama a action e mostra sucesso', async () => {
    const user = userEvent.setup();
    vi.mocked(aprovarPedidoAction).mockResolvedValue({ ok: true, data: { saldoAtual: 90, restante: 2, valor: 10, itemNome: 'Livro' } });
    render(<PedidosPendentes initial={[pedido] as never} />);

    await user.click(screen.getByRole('button', { name: /Aprovar/ }));
    expect(aprovarPedidoAction).toHaveBeenCalledWith({ pedidoId: 'p1' });
    expect(await screen.findByRole('status')).toHaveTextContent(/Compra aprovada/);
  });

  it('recusa → chama a action e some da lista', async () => {
    const user = userEvent.setup();
    vi.mocked(recusarPedidoAction).mockResolvedValue({ ok: true, data: { ok: true } });
    render(<PedidosPendentes initial={[pedido] as never} />);

    await user.click(screen.getByRole('button', { name: /Recusar/ }));
    expect(recusarPedidoAction).toHaveBeenCalledWith({ pedidoId: 'p1' });
    expect(await screen.findByText('Compra recusada.')).toBeInTheDocument();
  });

  it('erro na aprovação mostra mensagem específica', async () => {
    const user = userEvent.setup();
    vi.mocked(aprovarPedidoAction).mockResolvedValue({ ok: false, error: { code: 'SALDO_INSUFICIENTE', message: 'x' } });
    render(<PedidosPendentes initial={[pedido] as never} />);

    await user.click(screen.getByRole('button', { name: /Aprovar/ }));
    expect(await screen.findByText('Saldo insuficiente para esta compra.')).toBeInTheDocument();
  });
});
