import { vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';

/**
 * Mock mínimo do Prisma para testes UNITÁRIOS — sem banco real.
 * `$transaction(cb)` apenas invoca o callback com o `tx` mockado (não simula rollback:
 * o unitário verifica o RAMO de decisão do domínio; a atomicidade de verdade é coberta
 * na integração). Mock artesanal (vi.fn) para não adicionar dependência.
 */
export function makeMockDb() {
  const tx = {
    user: {
      update: vi.fn(),
      updateMany: vi.fn(),
      findUnique: vi.fn(),
      findUniqueOrThrow: vi.fn(),
    },
    item: {
      findUnique: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      create: vi.fn(),
    },
    transacao: {
      create: vi.fn(),
    },
    pedido: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
  };

  const db = {
    ...tx,
    $transaction: vi.fn(async (cb: (t: typeof tx) => unknown) => cb(tx)),
  };

  return { db: db as unknown as PrismaClient, tx };
}
