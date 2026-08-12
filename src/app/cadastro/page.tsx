import { redirect } from 'next/navigation';
import { getCurrentUser, rotaInicial } from '@/lib/auth';
import { Brand } from '@/components/Brand';
import { CadastroForm } from '@/components/CadastroForm';
import styles from '../login/page.module.css';

export default async function CadastroPage() {
  const user = await getCurrentUser();
  if (user && !user.bloqueado) redirect(rotaInicial(user.papel));

  return (
    <main className={styles.page}>
      <header className={styles.topbar}>
        <Brand />
      </header>
      <div className={styles.center}>
        <div className={styles.panel}>
          <div className={styles.head}>
            <h1 className={styles.title}>Criar conta</h1>
            <p className={styles.sub}>Confirme que você é aluno do Cotemig</p>
          </div>
          <CadastroForm />
        </div>
      </div>
    </main>
  );
}
