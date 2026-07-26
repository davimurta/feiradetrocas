import { redirect } from 'next/navigation';
import { Papel } from '@prisma/client';
import { getCurrentUser, rotaInicial, type AuthUser } from './auth';

export async function requireUser(...papeisPermitidos: Papel[]): Promise<AuthUser> {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  if (user.pendente) redirect('/pendente');
  if (papeisPermitidos.length > 0 && !papeisPermitidos.includes(user.papel)) {
    redirect(rotaInicial(user.papel));
  }
  return user;
}
