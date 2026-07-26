import type { PrismaClient, Unidade } from '@prisma/client';
import { Papel } from '@prisma/client';
import { prisma } from './prisma';
import { DomainError } from './errors';
import { readSessionUserId } from './session';

export interface AuthUser {
  id: string;
  papel: Papel;
  nome: string;
  email: string;
  unidade: Unidade;
  pendente: boolean;
}

let overrideUserId: string | null = null;

export function __setMockUserId(id: string | null): void {
  overrideUserId = id;
}

export async function getCurrentUser(db: PrismaClient = prisma): Promise<AuthUser | null> {
  const userId = overrideUserId ?? (await readSessionUserId());
  if (!userId) return null;
  return db.user.findUnique({
    where: { id: userId },
    select: { id: true, papel: true, nome: true, email: true, unidade: true, pendente: true },
  });
}

export function assertPapel(user: AuthUser | null, ...papeisPermitidos: Papel[]): AuthUser {
  if (!user) {
    throw new DomainError('NAO_AUTENTICADO', 'Nenhum usuário autenticado.');
  }
  if (!papeisPermitidos.includes(user.papel)) {
    throw new DomainError(
      'NAO_AUTORIZADO',
      `Papel "${user.papel}" não pode executar esta ação (requer: ${papeisPermitidos.join(', ')}).`,
    );
  }
  return user;
}

export function rotaInicial(papel: Papel): string {
  switch (papel) {
    case Papel.atendente_entrada:
      return '/entrada';
    case Papel.atendente_stand:
      return '/stand';
    case Papel.admin:
      return '/admin';
    default:
      return '/carteira';
  }
}
