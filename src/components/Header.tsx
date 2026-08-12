import Link from 'next/link';
import { SignOut, UserCircle } from '@phosphor-icons/react/dist/ssr';
import { Brand } from './Brand';
import { logoutAction } from '@/app/actions/auth';
import { googleHabilitado } from '@/lib/google';
import type { AuthUser } from '@/lib/auth';
import styles from './Header.module.css';

export function Header({ user }: { user: AuthUser }) {
  return (
    <header className={styles.header}>
      <div className={styles.inner}>
        <span className={styles.spacer} aria-hidden />
        <Brand />
        <div className={styles.userbar}>
          <div className={styles.who}>
            <b>{user.nome}</b>
            <div className={styles.papel}>
              {user.papel.replace('_', ' ')} · {user.unidade}
            </div>
          </div>
          {googleHabilitado() && (
            <Link className={styles.logout} href="/conta">
              <UserCircle size={16} weight="bold" />
              Conta
            </Link>
          )}
          <form action={logoutAction}>
            <button className={styles.logout} type="submit">
              <SignOut size={16} weight="bold" />
              Sair
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
