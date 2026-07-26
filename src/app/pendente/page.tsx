import { redirect } from 'next/navigation';
import { getCurrentUser, rotaInicial } from '@/lib/auth';
import { logoutAction } from '@/app/actions/auth';

export default async function PendentePage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  if (!user.pendente) redirect(rotaInicial(user.papel));

  return (
    <main className="screen screen--narrow stack" style={{ paddingTop: 40 }}>
      <div className="card center stack" style={{ paddingTop: 32, paddingBottom: 32 }}>
        <h1 className="page-title">Conta aguardando liberação</h1>
        <p className="muted">
          Olá, <b>{user.nome}</b>. Seu acesso (<span className="mono">{user.email}</span>) foi criado, mas
          precisa que um administrador defina seu perfil e unidade antes de você usar o sistema.
        </p>
        <p className="muted">Procure a organização da feira. Assim que for liberado, é só entrar de novo.</p>
        <form action={logoutAction}>
          <button className="btn btn--primary" type="submit">
            Sair
          </button>
        </form>
      </div>
    </main>
  );
}
