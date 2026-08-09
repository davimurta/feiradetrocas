import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TextInput } from '@/components/ui/TextInput';
import { SelectField } from '@/components/ui/SelectField';
import { TextareaField } from '@/components/ui/TextareaField';

describe('Campos padronizados', () => {
  it('TextInput associa label ao input e propaga onChange', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<TextInput label="Nome do item" value="" onChange={onChange} />);
    const input = screen.getByLabelText('Nome do item');
    await user.type(input, 'a');
    expect(onChange).toHaveBeenCalled();
  });

  it('TextInput mostra erro e marca aria-invalid', () => {
    render(<TextInput label="Email" error="Email inválido." value="" onChange={() => {}} />);
    expect(screen.getByText('Email inválido.')).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toHaveAttribute('aria-invalid', 'true');
  });

  it('TextInput mostra hint quando não há erro', () => {
    render(<TextInput label="Senha" hint="Mínimo 4 caracteres" value="" onChange={() => {}} />);
    expect(screen.getByText('Mínimo 4 caracteres')).toBeInTheDocument();
  });

  it('SelectField renderiza opções e associa label', () => {
    render(
      <SelectField label="Unidade" value="barroca" onChange={() => {}}>
        <option value="barroca">barroca</option>
        <option value="floresta">floresta</option>
      </SelectField>,
    );
    expect(screen.getByLabelText('Unidade')).toHaveValue('barroca');
    expect(screen.getByRole('option', { name: 'floresta' })).toBeInTheDocument();
  });

  it('TextareaField associa label', () => {
    render(<TextareaField label="Descrição" value="" onChange={() => {}} />);
    expect(screen.getByLabelText('Descrição')).toBeInTheDocument();
  });
});
