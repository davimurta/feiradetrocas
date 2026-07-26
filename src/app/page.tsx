import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/guard';
import { rotaInicial } from '@/lib/auth';

export default async function HomePage() {
  const user = await requireUser();
  redirect(rotaInicial(user.papel));
}
