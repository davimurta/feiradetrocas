import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AlertasDiscrepancia } from '@/components/alertas/AlertasDiscrepancia';
import type { AlertaDiscrepanciaView } from '@/server/queries';

const alertas: AlertaDiscrepanciaView[] = [
  {
    itemId: 'i1',
    nome: 'Notebook',
    categoria: 'Eletrônicos',
    unidade: 'barroca',
    valor: 500,
    aluno: 'Ana',
    origem: 'pendente',
    motivos: ['preco_discrepante'],
  },
  {
    itemId: 'i2',
    nome: 'Adesivo',
    categoria: 'Papelaria',
    unidade: 'floresta',
    valor: 0,
    aluno: null,
    origem: 'catalogo',
    motivos: ['preco_zero'],
  },
];

describe('AlertasDiscrepancia', () => {
  it('não renderiza nada quando não há alertas', () => {
    const { container } = render(<AlertasDiscrepancia alertas={[]} onEditar={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('lista os itens problemáticos com motivo e valor', () => {
    render(<AlertasDiscrepancia alertas={alertas} onEditar={() => {}} />);
    expect(screen.getByText('Notebook')).toBeInTheDocument();
    expect(screen.getByText('Preço destoante')).toBeInTheDocument();
    expect(screen.getByText('Preço zero')).toBeInTheDocument();
    expect(screen.getByText('500')).toBeInTheDocument();
  });

  it('clicar em "Editar" chama onEditar com o id do item', async () => {
    const user = userEvent.setup();
    const onEditar = vi.fn();
    render(<AlertasDiscrepancia alertas={alertas} onEditar={onEditar} />);
    await user.click(screen.getAllByRole('button', { name: /Editar/ })[0]);
    expect(onEditar).toHaveBeenCalledWith('i1');
  });
});
