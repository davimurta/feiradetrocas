import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Alert } from '@/components/ui/Alert';
import { Tabs } from '@/components/ui/Tabs';
import { Modal } from '@/components/ui/Modal';
import { SearchField } from '@/components/ui/SearchField';
import { Tooltip } from '@/components/ui/Tooltip';

describe('Alert', () => {
  it('erro usa role alert; sucesso usa role status', () => {
    const { rerender } = render(<Alert variant="error">falhou</Alert>);
    expect(screen.getByRole('alert')).toHaveTextContent('falhou');
    rerender(<Alert variant="success">ok</Alert>);
    expect(screen.getByRole('status')).toHaveTextContent('ok');
  });
});

describe('Tabs', () => {
  it('marca a aba ativa e troca ao clicar', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <Tabs
        value="a"
        onChange={onChange}
        items={[
          { value: 'a', label: 'Aba A' },
          { value: 'b', label: 'Aba B', badge: 3 },
        ]}
      />,
    );
    expect(screen.getByRole('tab', { name: 'Aba A' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: /Aba B/ })).toHaveTextContent('3');
    await user.click(screen.getByRole('tab', { name: /Aba B/ }));
    expect(onChange).toHaveBeenCalledWith('b');
  });
});

describe('Modal', () => {
  it('renderiza como dialog e fecha', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <Modal title="Reportar comprador" onClose={onClose}>
        <p>conteúdo</p>
      </Modal>,
    );
    expect(screen.getByRole('dialog', { name: 'Reportar comprador' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Fechar' }));
    expect(onClose).toHaveBeenCalled();
  });
});

describe('Tooltip', () => {
  it('tem um gatilho acessível e mostra os pares label/valor', () => {
    render(<Tooltip items={[{ label: 'Código', value: 'ITM-ABC' }, { label: 'Aluno', value: 'Ana' }]} />);
    expect(screen.getByRole('button', { name: /informações/i })).toBeInTheDocument();
    expect(screen.getByRole('tooltip')).toBeInTheDocument();
    expect(screen.getByText('ITM-ABC')).toBeInTheDocument();
    expect(screen.getByText('Ana')).toBeInTheDocument();
  });
});

describe('SearchField', () => {
  it('propaga o valor digitado', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<SearchField value="" onValueChange={onValueChange} placeholder="Buscar item…" />);
    await user.type(screen.getByLabelText('Buscar item…'), 'x');
    expect(onValueChange).toHaveBeenCalledWith('x');
  });
});
