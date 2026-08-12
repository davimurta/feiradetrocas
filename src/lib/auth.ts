import type { PrismaClient, Unidade } from '@prisma/client';
import { Papel } from '@prisma/client';
import { prisma } from './prisma';
import { DomainError } from './errors';
import { readSession } from './session';

export interface AuthUser {
  id: string;
  papel: Papel;
  nome: string;
  email: string;
  unidade: Unidade;
  pendente: boolean;
  bloqueado: boolean;
}

let overrideUserId: string | null = null;

export function __setMockUserId(id: string | null): void {
  if (process.env.NODE_ENV === 'production') return;
  overrideUserId = id;
}

function mockAtivo(): string | null {
  return process.env.NODE_ENV === 'production' ? null : overrideUserId;
}

const CAMPOS = {
  id: true,
  papel: true,
  nome: true,
  email: true,
  unidade: true,
  pendente: true,
  bloqueado: true,
} as const;

export async function getCurrentUser(db: PrismaClient = prisma): Promise<AuthUser | null> {
  const mock = mockAtivo();
  if (mock) {
    return db.user.findUnique({ where: { id: mock }, select: CAMPOS });
  }

  const sessao = await readSession();
  if (!sessao) return null;

  const user = await db.user.findUnique({
    where: { id: sessao.userId },
    select: { ...CAMPOS, sessionVersion: true },
  });
  if (!user) return null;
  if (user.sessionVersion !== sessao.versao) return null;

  const { sessionVersion: _descartado, ...autenticado } = user;
  return autenticado;
}

export function assertPapel(user: AuthUser | null, ...papeisPermitidos: Papel[]): AuthUser {
  if (!user) {
    throw new DomainError('NAO_AUTENTICADO', 'Nenhum usuário autenticado.');
  }
  if (user.bloqueado) {
    throw new DomainError('CONTA_BLOQUEADA', 'Conta bloqueada.');
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
