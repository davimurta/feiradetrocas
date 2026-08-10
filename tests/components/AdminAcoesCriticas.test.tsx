import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('@/app/actions/acoesCriticas', () => ({
  previaAcoesCriticasAction: vi.fn(),
  zerarSaldosAction: vi.fn(),
  creditarEmLoteAction: vi.fn(),
  moverItensDeUnidadeAction: vi.fn(),
  cancelarPedidosPendentesAction: vi.fn(),
  desbloquearContasAction: vi.fn(),
}));

import { AdminAcoesCriticas } from '@/components/admin/AdminAcoesCriticas';
import {
  previaAcoesCriticasAction,
  zerarSaldosAction,
  moverItensDeUnidadeAction,
} from '@/app/actions/acoesCriticas';

const previa = {
  participantes: 42,
  contasComSaldo: 30,
  fichasEmCirculacao: 850,
  contasBloqueadas: 2,
  pedidosPendentes: 3,
  estoquePorUnidade: [
    { unidade: 'barroca' as const, produtos: 12, pecas: 40, pendentes: 5 },
    { unidade: 'floresta' as const, produtos: 7, pecas: 18, pendentes: 1 },
  ],
};

async function abrirModal(nomeBotao: RegExp) {
  const user = userEvent.setup();
  render(<AdminAcoesCriticas />);
  await screen.findByText('850');
  await user.click(screen.getByRole('button', { name: nomeBotao }));
  return user;
}

describe('AdminAcoesCriticas', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(previaAcoesCriticasAction).mockResolvedValue({ ok: true, data: previa });
  });

  it('mostra o impacto de cada ação antes de executar', async () => {
    render(<AdminAcoesCriticas />);

    expect(await screen.findByText('850')).toBeInTheDocument();
    expect(screen.getByText(/30 contas com saldo · 850 fichas seriam apagadas/)).toBeInTheDocument();
    expect(screen.getByText(/3 pedidos aguardando aprovação/)).toBeInTheDocument();
    expect(screen.getByText(/barroca: 12 produtos \/ 40 peças/)).toBeInTheDocument();
  });

  it('nada é executado enquanto a confirmação não for digitada', async () => {
    const user = await abrirModal(/Zerar saldos/);

    const modal = screen.getByRole('dialog');
    const executar = within(modal).getByRole('button', { name: /Zerar saldos/ });
    expect(executar).toBeDisabled();

    await user.type(within(modal).getByLabelText(/Digite CONFIRMAR/), 'CONFIRMAR');
    expect(executar).toBeEnabled();
    expect(zerarSaldosAction).not.toHaveBeenCalled();
  });

  it('confirmar executa a ação e mostra o resultado', async () => {
    vi.mocked(zerarSaldosAction).mockResolvedValue({
      ok: true,
      data: { contasAfetadas: 30, fichas: 850 },
    });
    const user = await abrirModal(/Zerar saldos/);

    const modal = screen.getByRole('dialog');
    await user.type(within(modal).getByLabelText(/Digite CONFIRMAR/), 'CONFIRMAR');
    await user.click(within(modal).getByRole('button', { name: /Zerar saldos/ }));

    expect(zerarSaldosAction).toHaveBeenCalledWith({
      confirmacao: 'CONFIRMAR',
      apenasParticipantes: true,
    });
    expect(await screen.findByText(/30 contas zeradas · 850 fichas/)).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(previaAcoesCriticasAction).toHaveBeenCalledTimes(2);
  });

  it('erro do servidor aparece e o modal continua aberto para corrigir', async () => {
    vi.mocked(zerarSaldosAction).mockResolvedValue({
      ok: false,
      error: { code: 'CONFIRMACAO_INVALIDA', message: 'x' },
    });
    const user = await abrirModal(/Zerar saldos/);

    const modal = screen.getByRole('dialog');
    await user.type(within(modal).getByLabelText(/Digite CONFIRMAR/), 'CONFIRMAR');
    await user.click(within(modal).getByRole('button', { name: /Zerar saldos/ }));

    expect(await screen.findByText(/Digite CONFIRMAR para executar/)).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('mover itens bloqueia origem igual ao destino', async () => {
    const user = await abrirModal(/Mover itens/);

    const modal = screen.getByRole('dialog');
    await user.type(within(modal).getByLabelText(/Digite CONFIRMAR/), 'CONFIRMAR');
    await user.selectOptions(within(modal).getByLabelText('Para'), 'barroca');

    expect(within(modal).getByRole('button', { name: /Mover itens/ })).toBeDisabled();
    expect(within(modal).getByText('Escolha unidades diferentes.')).toBeInTheDocument();
    expect(moverItensDeUnidadeAction).not.toHaveBeenCalled();
  });

  it('ação sem alvo fica desabilitada no cartão', async () => {
    vi.mocked(previaAcoesCriticasAction).mockResolvedValue({
      ok: true,
      data: { ...previa, contasBloqueadas: 0, pedidosPendentes: 0 },
    });
    render(<AdminAcoesCriticas />);
    await screen.findByText('850');

    expect(screen.getByRole('button', { name: /Desbloquear/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Cancelar pedidos/ })).toBeDisabled();
  });
});
