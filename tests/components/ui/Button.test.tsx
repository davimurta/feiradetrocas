import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Button } from '@/components/ui/Button';

describe('Button', () => {
  it('renderiza o rótulo e dispara onClick', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Salvar</Button>);
    await user.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('desabilitado não dispara onClick', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <Button disabled onClick={onClick}>
        X
      </Button>,
    );
    await user.click(screen.getByRole('button', { name: 'X' }));
    expect(onClick).not.toHaveBeenCalled();
  });

  it('type padrão é button', () => {
    render(<Button>Ok</Button>);
    expect(screen.getByRole('button', { name: 'Ok' })).toHaveAttribute('type', 'button');
  });
});
