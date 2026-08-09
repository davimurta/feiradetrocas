'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { loginComSenhaAction } from '@/app/actions/auth';
import { mensagemErro } from '@/lib/mensagens';
import { cx } from '@/lib/cx';
import { chamar } from '@/lib/acao';
import { Alert, Button, TextInput, PasswordInput } from '@/components/ui';
import styles from './LoginForm.module.css';

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function entrar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    setLoading(true);
    const res = await chamar(loginComSenhaAction({ email, senha }));
    setLoading(false);
    if (res.ok) {
      router.replace(res.data.rota);
      router.refresh();
      return;
    }
    setErro(mensagemErro(res.error.code, res.error.message));
  }

  return (
    <form className={styles.form} onSubmit={entrar}>
      <TextInput
        label="Email"
        type="email"
        autoComplete="username"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="matricula@aluno.cotemig.com.br"
        disabled={loading}
      />

      <PasswordInput
        label="Senha"
        autoComplete="current-password"
        value={senha}
        onChange={(e) => setSenha(e.target.value)}
        placeholder="••••••••"
        disabled={loading}
      />

      {erro && <Alert variant="error">{erro}</Alert>}

      <Button type="submit" variant="primary" size="lg" block disabled={loading} className={styles.submit}>
        {loading ? 'Entrando…' : 'Entrar'}
      </Button>
      <p className={cx('muted', 'center', styles.hint)}>Primeiro acesso cria sua conta automaticamente.</p>
    </form>
  );
}
