'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { GoogleLogo, Eye, EyeSlash } from '@phosphor-icons/react/dist/ssr';
import { loginComSenhaAction, loginComGoogleAction } from '@/app/actions/auth';
import { mensagemErro } from '@/lib/mensagens';

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [show, setShow] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function entrar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    setLoading(true);
    const res = await loginComSenhaAction({ email, senha });
    if (res.ok) {
      router.replace(res.data.rota);
      router.refresh();
    } else {
      setLoading(false);
      setErro(mensagemErro(res.error.code, res.error.message));
    }
  }

  async function comGoogle() {
    setErro(null);
    setLoading(true);
    const res = await loginComGoogleAction({ email: email || undefined });
    if (res.ok) {
      router.replace(res.data.rota);
      router.refresh();
    } else {
      setLoading(false);
      setErro(mensagemErro(res.error.code, res.error.message));
    }
  }

  return (
    <div className="login-card">
      <h2>Faça seu login para iniciar</h2>

      <button type="button" className="google-btn" onClick={comGoogle} disabled={loading}>
        <GoogleLogo size={20} weight="bold" /> Faça login com o google
      </button>

      <div className="ou">OU</div>

      <form className="stack-sm" onSubmit={entrar}>
        <div className="field">
          <label htmlFor="email">Email</label>
          <input
            id="email"
            className="input"
            type="email"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="matricula@aluno.cotemig.com.br"
            disabled={loading}
          />
        </div>

        <div className="field">
          <label htmlFor="senha">Senha</label>
          <div className="pw">
            <input
              id="senha"
              className="input"
              type={show ? 'text' : 'password'}
              autoComplete="current-password"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              placeholder="••••••••"
              disabled={loading}
            />
            <button
              type="button"
              className="eye"
              onClick={() => setShow((s) => !s)}
              aria-label={show ? 'Ocultar senha' : 'Mostrar senha'}
            >
              {show ? <EyeSlash size={20} /> : <Eye size={20} />}
            </button>
          </div>
        </div>

        {erro && (
          <div className="alert alert--error" role="alert">
            {erro}
          </div>
        )}

        <button type="submit" className="btn btn--primary btn--block" disabled={loading}>
          {loading ? 'Entrando…' : 'Entrar'}
        </button>
        <p className="muted center" style={{ fontSize: '0.82rem' }}>
          Primeiro acesso cria sua conta automaticamente.
        </p>
      </form>
    </div>
  );
}
