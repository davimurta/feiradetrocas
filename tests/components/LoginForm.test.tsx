import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const replace = vi.fn();
const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace, refresh }) }));
vi.mock('@/app/actions/auth', () => ({
  loginComSenhaAction: vi.fn(),
  loginComGoogleAction: vi.fn(),
}));

import { LoginForm } from '@/components/LoginForm';
import { loginComSenhaAction } from '@/app/actions/auth';

describe('LoginForm', () => {
  beforeEach(() => vi.clearAllMocks());

  it('entra com email/senha e navega para a rota retornada', async () => {
    const user = userEvent.setup();
    vi.mocked(loginComSenhaAction).mockResolvedValue({ ok: true, data: { rota: '/carteira' } });
    render(<LoginForm />);

    await user.type(screen.getByLabelText('Email'), 'aluno@aluno.cotemig.com.br');
    await user.type(screen.getByLabelText('Senha'), 'segredo');
    await user.click(screen.getByRole('button', { name: 'Entrar' }));

    expect(loginComSenhaAction).toHaveBeenCalledWith({ email: 'aluno@aluno.cotemig.com.br', senha: 'segredo' });
    expect(replace).toHaveBeenCalledWith('/carteira');
  });

  it('mostra mensagem específica quando o login falha', async () => {
    const user = userEvent.setup();
    vi.mocked(loginComSenhaAction).mockResolvedValue({ ok: false, error: { code: 'CREDENCIAL_INVALIDA', message: 'x' } });
    render(<LoginForm />);

    await user.type(screen.getByLabelText('Email'), 'a@a.com');
    await user.type(screen.getByLabelText('Senha'), '1234');
    await user.click(screen.getByRole('button', { name: 'Entrar' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/Email ou senha incorretos/);
  });

  it('mostra/oculta a senha', async () => {
    const user = userEvent.setup();
    render(<LoginForm />);
    const senha = screen.getByLabelText('Senha');
    expect(senha).toHaveAttribute('type', 'password');
    await user.click(screen.getByRole('button', { name: 'Mostrar senha' }));
    expect(senha).toHaveAttribute('type', 'text');
  });
});
