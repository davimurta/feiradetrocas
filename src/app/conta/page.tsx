import Link from 'next/link';
import { GoogleLogo, LinkBreak, ShieldCheck } from '@phosphor-icons/react/dist/ssr';
import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/guard';
import { googleHabilitado, PROVIDER } from '@/lib/google';
import { desvincularGoogleAction } from '@/app/actions/conta';
import { Alert, Button } from '@/components/ui';
import styles from './page.module.css';

const MENSAGENS: Record<string, string> = {
  google_vinculado: 'Conta Google vinculada.',
  google_em_uso: 'Essa conta Google já está vinculada a outra pessoa da feira.',
  dominio_recusado: 'Use uma conta Google do domínio do colégio.',
  email_nao_verificado: 'O Google não confirmou esse email.',
  state_invalido: 'A sessão de login expirou. Tente de novo.',
  troca_falhou: 'Não foi possível falar com o Google agora.',
  token_invalido: 'Resposta do Google recusada.',
};

export default async function ContaPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; erro?: string }>;
}) {
  const user = await requireUser();
  const params = await searchParams;

  const vinculo = googleHabilitado()
    ? await prisma.contaExterna.findFirst({
        where: { userId: user.id, provider: PROVIDER },
        select: { id: true, email: true, createdAt: true },
      })
    : null;

  return (
    <main className="screen stack">
      <h1 className="page-title">Minha conta</h1>

      {params.ok && <Alert variant="success">{MENSAGENS[params.ok] ?? 'Pronto.'}</Alert>}
      {params.erro && <Alert variant="error">{MENSAGENS[params.erro] ?? 'Não deu certo.'}</Alert>}

      <section className={styles.cartao}>
        <h2 className={styles.titulo}>
          <ShieldCheck size={16} weight="bold" /> Vínculo com o Cotemig
        </h2>
        {user.papel === 'participante' ? (
          <p className={styles.texto}>
            Sua conta está identificada como <b>{user.nome}</b>, matrícula{' '}
            <b>{user.email.split('@')[0]}</b>, unidade <b>{user.unidade}</b>.
          </p>
        ) : (
          <p className={styles.texto}>
            Conta de equipe ({user.papel.replace('_', ' ')}), criada pela organização da feira.
          </p>
        )}
      </section>

      {googleHabilitado() && (
        <section className={styles.cartao}>
          <h2 className={styles.titulo}>
            <GoogleLogo size={16} weight="bold" /> Entrar com Google
          </h2>

          {vinculo ? (
            <>
              <p className={styles.texto}>
                Vinculada a <b>{vinculo.email ?? 'sua conta Google'}</b>. Você pode entrar na
                feira pelo Google além da senha.
              </p>
              <form action={desvincularGoogleAction}>
                <Button type="submit" variant="ghost">
                  <LinkBreak size={16} weight="bold" /> Desvincular
                </Button>
              </form>
            </>
          ) : (
            <>
              <p className={styles.texto}>
                Atalho opcional para entrar sem digitar a senha. Não substitui o seu vínculo com
                o Cotemig, e sozinho não cria conta nenhuma.
              </p>
              <Link className={styles.botaoLink} href="/api/auth/google/iniciar?modo=vincular">
                <GoogleLogo size={16} weight="bold" /> Vincular minha conta Google
              </Link>
            </>
          )}
        </section>
      )}
    </main>
  );
}
