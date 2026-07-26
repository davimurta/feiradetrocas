import { beforeEach, afterAll } from 'vitest';
import { DB_ENABLED } from './db';

/**
 * setupFile (por worker) dos projetos de banco. Deixa cada teste começar com o banco
 * limpo e fecha a conexão ao final. Imports do Prisma são dinâmicos para não conectar
 * quando os testes de banco estão desativados.
 */
if (DB_ENABLED) {
  beforeEach(async () => {
    const { prisma } = await import('@/lib/prisma');
    const { resetDb } = await import('./db');
    await resetDb(prisma);
  });

  afterAll(async () => {
    const { prisma } = await import('@/lib/prisma');
    await prisma.$disconnect();
  });
}
