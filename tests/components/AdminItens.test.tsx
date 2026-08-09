import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('@/app/actions/admin', () => ({
  editarItemAction: vi.fn(),
  excluirItemAction: vi.fn(),
  listarItensAction: vi.fn(async () => ({ ok: true, data: [] })),
}));

import { AdminItens } from '@/components/admin/AdminItens';
import { editarItemAction, excluirItemAction, listarItensAction } from '@/app/actions/admin';
import type { ItemAdmin } from '@/server/queries';

const item: ItemAdmin = { id: 'i1', codigo: 'ITM-A', nome: 'Livro', categoria: 'Livros', valor: 10, quantidade: 3, unidade: 'barroca', descricao: null };

describe('AdminItens (edição in-place)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('salvar atualiza a linha sem refazer a listagem', async () => {
    const user = userEvent.setup();
    vi.mocked(editarItemAction).mockResolvedValue({ ok: true, data: { ...item, nome: 'Livro Editado' } });
    render(<AdminItens initial={[item]} />);

    const salvar = screen.getByRole('button', { name: 'Salvar' });
    expect(salvar).toBeDisabled(); // nada mudou ainda

    const nome = screen.getByLabelText('Nome');
    await user.clear(nome);
    await user.type(nome, 'Livro Editado');
    expect(salvar).toBeEnabled();

    await user.click(salvar);
    expect(editarItemAction).toHaveBeenCalledWith(expect.objectContaining({ id: 'i1', nome: 'Livro Editado' }));
    // update-in-place: não refez a listagem no mount nem após salvar
    expect(listarItensAction).not.toHaveBeenCalled();
    expect(await screen.findByDisplayValue('Livro Editado')).toBeInTheDocument();
  });

  it('excluir remove a linha da lista', async () => {
    const user = userEvent.setup();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    vi.mocked(excluirItemAction).mockResolvedValue({ ok: true, data: { id: 'i1' } });
    render(<AdminItens initial={[item]} />);

    await user.click(screen.getByRole('button', { name: 'Excluir' }));
    expect(excluirItemAction).toHaveBeenCalledWith({ id: 'i1' });
    expect(await screen.findByText('Nenhum item.')).toBeInTheDocument();
  });
});
