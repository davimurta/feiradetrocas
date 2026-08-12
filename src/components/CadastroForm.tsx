'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ShieldCheck, LockKey, Ticket } from '@phosphor-icons/react';
import { cadastrarAction, cadastrarComConviteAction } from '@/app/actions/cadastro';
import { mensagemErro } from '@/lib/mensagens';
import { chamar } from '@/lib/acao';
import { Alert, Button, TextInput, PasswordInput } from '@/components/ui';
import { Contador } from '@/components/Contador';
import styles from './CadastroForm.module.css';

type Caminho = 'cotemig' | 'convite';

export function CadastroForm() {
  const router = useRouter();
  const [caminho, setCaminho] = useState<Caminho>('cotemig');

  const [usuario, setUsuario] = useState('');
  const [senhaCotemig, setSenhaCotemig] = useState('');
  const [codigo, setCodigo] = useState('');
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [senhaApp, setSenhaApp] = useState('');

  const [erro, setErro] = useState<string | null>(null);
  const [espera, setEspera] = useState(0);
  const [loading, setLoading] = useState(false);

  const bloqueado = espera > 0;
  const desativado = loading || bloqueado;

  function trocar(novo: Caminho) {
    setCaminho(novo);
    setErro(null);
    setSenhaCotemig('');
  }

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    setLoading(true);

    const res =
      caminho === 'cotemig'
        ? await chamar(cadastrarAction({ usuario, senhaCotemig, senhaApp }))
        : await chamar(cadastrarComConviteAction({ codigo, nome, email, senhaApp }));

    setSenhaCotemig('');
    setLoading(false);

    if (res.ok) {
      router.replace(res.data.rota);
      router.refresh();
      return;
    }

    setEspera(res.error.retryAfter ?? 0);
    setErro(mensagemErro(res.error.code, res.error.message));
  }

  return (
    <form className={styles.form} onSubmit={enviar}>
      <div className={styles.seletor} role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={caminho === 'cotemig'}
          className={caminho === 'cotemig' ? styles.opcaoAtiva : styles.opcao}
          onClick={() => trocar('cotemig')}
          disabled={desativado}
        >
          Tenho matrícula
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={caminho === 'convite'}
          className={caminho === 'convite' ? styles.opcaoAtiva : styles.opcao}
          onClick={() => trocar('convite')}
          disabled={desativado}
        >
          Tenho um convite
        </button>
      </div>

      {caminho === 'cotemig' ? (
        <div className={styles.secao}>
          <span className={styles.secaoTitulo}>
            <ShieldCheck size={14} weight="bold" /> Confirmação de vínculo
          </span>

          <TextInput
            label="Usuário do portal do Cotemig"
            autoComplete="username"
            value={usuario}
            onChange={(e) => setUsuario(e.target.value)}
            placeholder="sua matrícula"
            disabled={desativado}
          />

          <PasswordInput
            label="Senha do portal do Cotemig"
            autoComplete="off"
            value={senhaCotemig}
            onChange={(e) => setSenhaCotemig(e.target.value)}
            placeholder="••••••••"
            disabled={desativado}
          />

          <p className={styles.aviso}>
            <LockKey size={16} weight="fill" />
            <span>
              É a <strong>mesma senha do portal do Cotemig</strong>, usada uma única vez para
              confirmar que você é aluno. Ela não fica armazenada aqui, não é enviada para
              ninguém e não é guardada nem em forma embaralhada.
            </span>
          </p>
        </div>
      ) : (
        <div className={styles.secao}>
          <span className={styles.secaoTitulo}>
            <Ticket size={14} weight="bold" /> Convite da organização
          </span>

          <TextInput
            label="Código de convite"
            value={codigo}
            onChange={(e) => setCodigo(e.target.value.toUpperCase())}
            placeholder="XXXX-XXXX"
            autoComplete="off"
            spellCheck={false}
            className={styles.campoCodigo}
            disabled={desativado}
          />

          <TextInput
            label="Seu nome"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            placeholder="como você quer aparecer no stand"
            autoComplete="name"
            disabled={desativado}
          />

          <TextInput
            label="Seu email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="voce@exemplo.com"
            autoComplete="email"
            disabled={desativado}
          />

          <p className={styles.aviso}>
            <Ticket size={16} weight="fill" />
            <span>
              Para quem não tem matrícula no Cotemig. Peça o código à organização da feira. O
              email vira o seu login, e a unidade já vem definida no convite.
            </span>
          </p>
        </div>
      )}

      <div className={styles.secao}>
        <span className={styles.secaoTitulo}>Sua senha na Feira de Trocas</span>

        <PasswordInput
          label="Senha para entrar na feira"
          autoComplete="new-password"
          value={senhaApp}
          onChange={(e) => setSenhaApp(e.target.value)}
          placeholder="••••••••"
          disabled={desativado}
        />

        <p className={styles.aviso}>
          <span>
            Essa é a senha que você vai usar no dia da feira.
            {caminho === 'cotemig' && ' Pode ser diferente da do portal, e é melhor que seja.'}
          </span>
        </p>
      </div>

      {erro && (
        <Alert variant="error">
          {erro}
          {bloqueado && (
            <>
              {' '}
              Tente de novo em{' '}
              <span className={styles.contador}>
                <Contador segundos={espera} aoZerar={() => setEspera(0)} />
              </span>
              .
            </>
          )}
        </Alert>
      )}

      <Button
        type="submit"
        variant="primary"
        size="lg"
        block
        disabled={desativado}
        className={styles.submit}
      >
        {loading ? 'Confirmando…' : 'Criar minha conta'}
      </Button>

      <p className={styles.rodape}>
        Já tem conta? <Link href="/login">Entrar</Link>
      </p>
    </form>
  );
}
