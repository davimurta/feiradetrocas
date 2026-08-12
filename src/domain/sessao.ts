import type { PrismaClient } from '@prisma/client';

type Db = Pick<PrismaClient, 'user'>;

export async function invalidarSessoes(db: Db, userId: string): Promise<void> {
  await db.user.updateMany({ where: { id: userId }, data: { sessionVersion: { increment: 1 } } });
}

export async function invalidarSessoesEmLote(db: Db, ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await db.user.updateMany({ where: { id: { in: ids } }, data: { sessionVersion: { increment: 1 } } });
}
