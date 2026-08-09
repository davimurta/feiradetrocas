import { redirect } from 'next/navigation';
import { getCurrentUser, rotaInicial } from '@/lib/auth';
import { logoutAction } from '@/app/actions/auth';
import { Alert, Button } from '@/components/ui';
import { Brand } from '@/components/Brand';
import { LoginForm } from '@/components/LoginForm';
import styles from './page.module.css';

export default async function LoginPage() {
  const user = await getCurrentUser();
  if (user && !user.bloqueado) redirect(rotaInicial(user.papel));

  return (
    <main className={styles.page}>
      <header className={styles.topbar}>
        <Brand />
      </header>
      <div className={styles.center}>
        <div className={styles.panel}>
          {user?.bloqueado ? (
            <div className={styles.blocked}>
              <Alert variant="error">Sua conta está bloqueada. Procure a organização da feira.</Alert>
              <form action={logoutAction}>
                <Button type="submit" variant="ghost" block>
                  Sair
                </Button>
              </form>
            </div>
          ) : (
            <>
              <div className={styles.head}>
                <h1 className={styles.title}>Feira de Trocas</h1>
                <p className={styles.sub}>Entre para começar a trocar</p>
              </div>
              <LoginForm />
            </>
          )}
        </div>
      </div>
    </main>
  );
}
