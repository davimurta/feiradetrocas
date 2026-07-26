import type { Papel, Unidade, User, Item } from '@prisma/client';
import { Papel as PapelEnum } from '@prisma/client';
import { prisma } from '@/lib/prisma';

let seq = 0;
function unico(): string {
  seq += 1;
  return `${Date.now().toString(36)}${seq}`;
}

export function criarUsuario(
  overrides: Partial<{
    nome: string;
    email: string;
    papel: Papel;
    unidade: Unidade;
    saldo: number;
    pendente: boolean;
    senhaHash: string | null;
    provider: string;
    codigoCarteira: string;
  }> = {},
): Promise<User> {
  const email = overrides.email ?? `${unico()}@aluno.cotemig.com.br`;
  return prisma.user.create({
    data: {
      nome: overrides.nome ?? 'Aluno Teste',
      email,
      papel: overrides.papel ?? PapelEnum.participante,
      unidade: overrides.unidade ?? 'barroca',
      saldo: overrides.saldo ?? 0,
      pendente: overrides.pendente ?? false,
      senhaHash: overrides.senhaHash ?? null,
      provider: overrides.provider ?? 'password',
      codigoCarteira: overrides.codigoCarteira ?? email.split('@')[0],
    },
  });
}

export function criarAtendente(papel: Papel, unidade: Unidade = 'barroca'): Promise<User> {
  return criarUsuario({ nome: `Atendente ${papel}`, papel, unidade, email: `${unico()}@cotemig.com.br` });
}

export function criarItem(
  overrides: Partial<{
    codigo: string;
    nome: string;
    categoria: string;
    valor: number;
    quantidade: number;
    unidade: Unidade;
  }> = {},
): Promise<Item> {
  return prisma.item.create({
    data: {
      codigo: overrides.codigo ?? `ITM-${unico().toUpperCase()}`,
      nome: overrides.nome ?? `Item ${unico()}`,
      categoria: overrides.categoria ?? 'Livros',
      valor: overrides.valor ?? 10,
      quantidade: overrides.quantidade ?? 1,
      unidade: overrides.unidade ?? 'barroca',
    },
  });
}
