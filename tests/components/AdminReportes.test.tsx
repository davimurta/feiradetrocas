import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('@/app/actions/admin', () => ({
  listarReportesAction: vi.fn(async () => ({ ok: true, data: [] })),
  bloquearContaAction: vi.fn(),
  ajustarSaldoAction: vi.fn(),
}));

import { AdminReportes } from '@/components/admin/AdminReportes';
import { bloquearContaAction, ajustarSaldoAction, listarReportesAction } from '@/app/actions/admin';
import type { ReporteView } from '@/server/queries';

const reporte: ReporteView = {
  id: 'r1',
  motivo: 'furto',
  descricao: 'levou sem pagar',
  createdAt: new Date('2026-07-20T13:45:00'),
  reportadoId: 'c1',
  reportadoNome: 'Ana Souza',
  reportadoMatricula: '10240099',
  reportadoSaldo: 42,
  reportadoBloqueado: false,
  reportanteNome: 'Stand Barroca',
};

describe('AdminReportes (ações do admin)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(listarReportesAction).mockResolvedValue({ ok: true, data: [reporte] });
  });

  it('mostra matrícula, horário e motivo', () => {
    render(<AdminReportes initial={[reporte]} />);
    expect(screen.getByText('10240099')).toBeInTheDocument();
    expect(screen.getByText('furto')).toBeInTheDocument();
    expect(screen.getByText(/20\/07/)).toBeInTheDocument();
  });

  it('bloquear conta chama a action com o id do denunciado', async () => {
    const user = userEvent.setup();
    vi.mocked(bloquearContaAction).mockResolvedValue({ ok: true, data: { id: 'c1', bloqueado: true } });
    render(<AdminReportes initial={[reporte]} />);

    await user.click(screen.getByRole('button', { name: /Bloquear conta/ }));
    expect(bloquearContaAction).toHaveBeenCalledWith({ id: 'c1', bloqueado: true });
    expect(await screen.findByRole('status')).toHaveTextContent(/bloqueado/);
  });

  it('zerar saldo chama ajustarSaldo com 0 (após confirmar)', async () => {
    const user = userEvent.setup();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    vi.mocked(ajustarSaldoAction).mockResolvedValue({ ok: true, data: { saldoAtual: 0, delta: -42 } });
    render(<AdminReportes initial={[reporte]} />);

    await user.click(screen.getByRole('button', { name: /Zerar saldo/ }));
    expect(ajustarSaldoAction).toHaveBeenCalledWith({ id: 'c1', novoSaldo: 0 });
    expect(await screen.findByRole('status')).toHaveTextContent(/zerado/);
  });
});
