import { redirect } from 'next/navigation';
import { getCurrentUser, rotaInicial } from '@/lib/auth';
import { Brand } from '@/components/Brand';
import { LoginForm } from '@/components/LoginForm';

export default async function LoginPage() {
  const user = await getCurrentUser();
  if (user) redirect(rotaInicial(user.papel));

  return (
    <main className="login-page stack">
      <h1 className="login-title">FEIRA DE TROCAS</h1>
      <div className="header header--plain" style={{ margin: '0 0 12px', width: '100%' }}>
        <Brand />
      </div>
      <LoginForm />
    </main>
  );
}
