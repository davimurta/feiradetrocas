import { describe } from 'vitest';
import type { PrismaClient } from '@prisma/client';

/** Testes de banco só rodam se houver DATABASE_URL (configurado via .env.test). */
export const DB_ENABLED = Boolean(process.env.DATABASE_URL);

/**
 * `describe` que se auto-pula quando não há banco de teste configurado, para que
 * `npm run test:integration` sem banco no ar não quebre com ruído, apenas pula.
 */
export const describeDb = DB_ENABLED ? describe : describe.skip;

/**
 * Zera o banco entre testes. TRUNCATE ... CASCADE limpa tudo de uma vez (mais rápido que
 * deletar linha a linha e resolve as FKs de uma só vez).
 */
export async function resetDb(prisma: PrismaClient): Promise<void> {
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE "reportes", "itens_pendentes", "transacoes", "items", "users" RESTART IDENTITY CASCADE',
  );
}
