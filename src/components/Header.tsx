import { SignOut } from '@phosphor-icons/react/dist/ssr';
import { Brand } from './Brand';
import { logoutAction } from '@/app/actions/auth';
import type { AuthUser } from '@/lib/auth';

export function Header({ user }: { user: AuthUser }) {
  return (
    <header className="header">
      <span className="header-spacer" aria-hidden />
      <Brand />
      <div className="userbar">
        <div className="who">
          <b>{user.nome}</b>
          <div className="papel">
            {user.papel.replace('_', ' ')} · {user.unidade}
          </div>
        </div>
        <form action={logoutAction}>
          <button className="btn-logout" type="submit">
            <SignOut size={18} weight="bold" />
            Sair
          </button>
        </form>
      </div>
    </header>
  );
}
