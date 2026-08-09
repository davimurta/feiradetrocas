import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('@/app/actions/admin', () => ({
  editarUsuarioAction: vi.fn(),
  ajustarSaldoAction: vi.fn(),
  listarUsuariosAction: vi.fn(async () => ({ ok: true, data: [] })),
}));

import { AdminUsuarios } from '@/components/admin/AdminUsuarios';
import { editarUsuarioAction, listarUsuariosAction } from '@/app/actions/admin';
import type { UsuarioAdmin } from '@/server/queries';

const pendente: UsuarioAdmin = {
  id: 'u1',
  nome: 'Novo Aluno',
  email: 'novo@aluno.cotemig.com.br',
  papel: 'participante',
  unidade: 'barroca',
  saldo: 0,
  codigoCarteira: 'novo',
  pendente: true,
};

describe('AdminUsuarios (ativar conta pendente)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('exige papel/unidade e salva in-place sem refetch', async () => {
    const user = userEvent.setup();
    vi.mocked(editarUsuarioAction).mockResolvedValue({ ok: true, data: { ...pendente, unidade: 'floresta', pendente: false } });
    render(<AdminUsuarios initial={[pendente]} />);

    const salvar = screen.getByRole('button', { name: 'Salvar' });
    expect(salvar).toBeDisabled();

    await user.selectOptions(screen.getByLabelText(/Papel/), 'participante');
    await user.selectOptions(screen.getByLabelText(/Unidade/), 'floresta');
    expect(salvar).toBeEnabled();

    await user.click(salvar);
    expect(editarUsuarioAction).toHaveBeenCalledWith({ id: 'u1', nome: 'Novo Aluno', papel: 'participante', unidade: 'floresta' });
    expect(listarUsuariosAction).not.toHaveBeenCalled();
  });

  it('conta pendente é sinalizada por ícone + texto para leitor de tela', () => {
    render(<AdminUsuarios initial={[pendente]} />);

    expect(screen.getByRole('status')).toHaveTextContent('Conta pendente: defina papel e unidade');
    expect(screen.getByTitle('Conta pendente: defina papel e unidade')).toBeInTheDocument();
  });

  it('o aviso não entra no nome acessível do campo Nome', () => {
    render(<AdminUsuarios initial={[pendente]} />);

    // Se o texto do aviso morasse dentro do <label>, "Papel" casaria com dois campos.
    expect(screen.getByLabelText(/Papel/)).toHaveRole('combobox');
    expect(screen.getByLabelText('Nome')).toHaveValue('Novo Aluno');
  });

  it('conta ativa não mostra aviso nenhum', () => {
    render(<AdminUsuarios initial={[{ ...pendente, pendente: false }]} />);

    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.queryByTitle('Conta pendente: defina papel e unidade')).not.toBeInTheDocument();
  });
});
