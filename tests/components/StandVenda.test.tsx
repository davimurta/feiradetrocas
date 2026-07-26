import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StandVenda } from '@/components/stand/StandVenda';
import type { ActionResult } from '@/app/actions/_result';
import type { ProdutoView, AlunoView, PedidoStatusView } from '@/server/queries';
import type { CriarPedidoResult } from '@/domain/pedido';

const item: ProdutoView = { id: 'i1', codigo: 'ITM-X', nome: 'Livro', categoria: 'Livros', valor: 10, quantidade: 3 };
const comprador: AlunoView = { id: 'c1', nome: 'Ana', email: 'a@aluno.cotemig.com.br', saldo: 100, codigoCarteira: '20240001' };

const okCatalogo = vi.fn(async (): Promise<ActionResult<ProdutoView[]>> => ({ ok: true, data: [item] }));
const okComprador = vi.fn(async (): Promise<ActionResult<AlunoView>> => ({ ok: true, data: comprador }));
const pendentePoll = vi.fn(async (): Promise<ActionResult<PedidoStatusView>> => ({ ok: true, data: { status: 'pendente', motivoRecusa: null } }));

const pedidoOk = (over: Partial<CriarPedidoResult> = {}) =>
  vi.fn(async (): Promise<ActionResult<CriarPedidoResult>> => ({
    ok: true,
    data: { pedidoId: 'p1', itemNome: 'Livro', valor: 10, compradorNome: 'Ana', compradorSaldo: 100, suficiente: true, ...over },
  }));

async function montarPedido(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('button', { name: /Vender Livro/ }));
  await user.type(screen.getByLabelText(/Carteira do comprador/), '20240001');
  await user.click(screen.getByRole('button', { name: 'Buscar' }));
  await screen.findByText(/Saldo: 100/);
  await user.click(screen.getByRole('button', { name: /Enviar para aprovação/ }));
}

describe('StandVenda (pedido + aprovação)', () => {
  it('envia o pedido e mostra "Aguardando aprovação"', async () => {
    const user = userEvent.setup();
    const criarPedido = pedidoOk();
    render(
      <StandVenda initial={[item]} buscarCatalogo={okCatalogo} buscarComprador={okComprador} criarPedido={criarPedido} consultarPedido={pendentePoll} cancelarPedido={vi.fn()} />,
    );
    await montarPedido(user);

    expect(await screen.findByText('Aguardando aprovação')).toBeInTheDocument();
    expect(criarPedido).toHaveBeenCalledWith({ itemId: 'i1', codigoCarteira: '20240001' });
  });

  it('erro do domínio ao criar pedido mostra mensagem específica', async () => {
    const user = userEvent.setup();
    const criarPedido = vi.fn(async (): Promise<ActionResult<CriarPedidoResult>> => ({ ok: false, error: { code: 'ITEM_INDISPONIVEL', message: 'x' } }));
    render(
      <StandVenda initial={[item]} buscarCatalogo={okCatalogo} buscarComprador={okComprador} criarPedido={criarPedido} consultarPedido={pendentePoll} cancelarPedido={vi.fn()} />,
    );
    await montarPedido(user);
    expect(await screen.findByRole('alert')).toHaveTextContent('Item esgotado.');
  });

  it('cancelar pedido pendente', async () => {
    const user = userEvent.setup();
    const cancelar = vi.fn(async (): Promise<ActionResult<{ ok: true }>> => ({ ok: true, data: { ok: true } }));
    render(
      <StandVenda initial={[item]} buscarCatalogo={okCatalogo} buscarComprador={okComprador} criarPedido={pedidoOk()} consultarPedido={pendentePoll} cancelarPedido={cancelar} />,
    );
    await montarPedido(user);
    await user.click(await screen.findByRole('button', { name: /Cancelar pedido/ }));
    expect(cancelar).toHaveBeenCalledWith({ pedidoId: 'p1' });
    expect(await screen.findByText('Pedido cancelado')).toBeInTheDocument();
  });
});
