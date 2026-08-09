import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
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
const okReportar = vi.fn(async () => ({ ok: true as const, data: { id: 'r1', reportadoNome: 'Ana' } }));

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
      <StandVenda initial={[item]} buscarCatalogo={okCatalogo} buscarComprador={okComprador} criarPedido={criarPedido} consultarPedido={pendentePoll} cancelarPedido={vi.fn()} reportar={okReportar} />,
    );
    await montarPedido(user);

    expect(await screen.findByText('Aguardando aprovação')).toBeInTheDocument();
    expect(criarPedido).toHaveBeenCalledWith({ itemId: 'i1', codigoCarteira: '20240001' });
  });

  it('erro do domínio ao criar pedido mostra mensagem específica', async () => {
    const user = userEvent.setup();
    const criarPedido = vi.fn(async (): Promise<ActionResult<CriarPedidoResult>> => ({ ok: false, error: { code: 'ITEM_INDISPONIVEL', message: 'x' } }));
    render(
      <StandVenda initial={[item]} buscarCatalogo={okCatalogo} buscarComprador={okComprador} criarPedido={criarPedido} consultarPedido={pendentePoll} cancelarPedido={vi.fn()} reportar={okReportar} />,
    );
    await montarPedido(user);
    expect(await screen.findByRole('alert')).toHaveTextContent('Item esgotado.');
  });

  it('cancelar pedido pendente', async () => {
    const user = userEvent.setup();
    const cancelar = vi.fn(async (): Promise<ActionResult<{ ok: true }>> => ({ ok: true, data: { ok: true } }));
    render(
      <StandVenda initial={[item]} buscarCatalogo={okCatalogo} buscarComprador={okComprador} criarPedido={pedidoOk()} consultarPedido={pendentePoll} cancelarPedido={cancelar} reportar={okReportar} />,
    );
    await montarPedido(user);
    await user.click(await screen.findByRole('button', { name: /Cancelar pedido/ }));
    expect(cancelar).toHaveBeenCalledWith({ pedidoId: 'p1' });
    expect(await screen.findByText('Pedido cancelado')).toBeInTheDocument();
  });

  it('reportar comprador: abre modal, envia motivo e mostra confirmação', async () => {
    const user = userEvent.setup();
    const reportar = vi.fn(async () => ({ ok: true as const, data: { id: 'r1', reportadoNome: 'Ana' } }));
    render(
      <StandVenda initial={[item]} buscarCatalogo={okCatalogo} buscarComprador={okComprador} criarPedido={pedidoOk()} consultarPedido={pendentePoll} cancelarPedido={vi.fn()} reportar={reportar} />,
    );
    await montarPedido(user);

    await user.click(await screen.findByRole('button', { name: /Reportar comprador/ }));
    const modal = await screen.findByRole('dialog', { name: /Reportar comprador/ });
    await user.type(within(modal).getByLabelText('Motivo'), 'furto');
    await user.type(within(modal).getByLabelText('Descrição'), 'levou sem pagar');
    await user.click(within(modal).getByRole('button', { name: /Enviar reporte/ }));

    expect(reportar).toHaveBeenCalledWith({ pedidoId: 'p1', motivo: 'furto', descricao: 'levou sem pagar' });
    expect(await screen.findByRole('status')).toHaveTextContent(/Reporte registrado contra Ana/);
  });
});
