'use server';

import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth';
import { PROVIDER } from '@/lib/google';

export async function desvincularGoogleAction(): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  await prisma.contaExterna.deleteMany({ where: { userId: user.id, provider: PROVIDER } });
  redirect('/conta');
}
