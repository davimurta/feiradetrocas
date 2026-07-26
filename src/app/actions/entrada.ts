'use server';

import { z } from 'zod';
import { Papel, Unidade } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { getCurrentUser, assertPapel } from '@/lib/auth';
import { receberItem, type ReceberItemResult } from '@/domain/entrada';
import { garantirAluno } from '@/domain/auth';
import {
  buscarItensPorNome,
  buscarAlunoPorIdentificador,
  type ProdutoView,
  type AlunoView,
} from '@/server/queries';
import { ok, fail, type ActionResult } from './_result';

const PAPEIS = [Papel.atendente_entrada, Papel.admin] as const;

const receberSchema = z.object({
  matricula: z.string().trim().min(1, 'Informe a matrícula ou email do aluno.'),
  nome: z.string().trim().min(1, 'Informe o nome do item.').max(120),
  categoria: z.string().trim().min(1, 'Escolha a categoria.').max(60),
  valor: z.number().int('O valor deve ser inteiro.').positive('O valor deve ser positivo.'),
  // A recepção escolhe a unidade do item (não fica presa à unidade do atendente).
  unidade: z.nativeEnum(Unidade),
});

export type ReceberItemActionResult = ReceberItemResult & {
  alunoNome: string;
  alunoCriado: boolean;
};

export async function receberItemAction(
  input: z.input<typeof receberSchema>,
): Promise<ActionResult<ReceberItemActionResult>> {
  try {
    const user = await getCurrentUser();
    const atendente = assertPapel(user, ...PAPEIS);
    const dados = receberSchema.parse(input);

    const { user: aluno, criado } = await garantirAluno(prisma, { identificador: dados.matricula });
    const res = await receberItem(prisma, {
      alunoId: aluno.id,
      atendenteId: atendente.id,
      unidade: dados.unidade,
      nome: dados.nome,
      categoria: dados.categoria,
      valor: dados.valor,
    });
    return ok({ ...res, alunoNome: aluno.nome, alunoCriado: criado });
  } catch (err) {
    return fail(err);
  }
}

const buscaNomeSchema = z.object({ nome: z.string().trim().min(1), unidade: z.nativeEnum(Unidade) });

export async function buscarItensPorNomeAction(
  input: z.input<typeof buscaNomeSchema>,
): Promise<ActionResult<ProdutoView[]>> {
  try {
    const user = await getCurrentUser();
    assertPapel(user, ...PAPEIS);
    const { nome, unidade } = buscaNomeSchema.parse(input);
    return ok(await buscarItensPorNome(unidade, nome));
  } catch (err) {
    return fail(err);
  }
}

const idSchema = z.object({ identificador: z.string().trim().min(1) });

export async function buscarAlunoAction(
  input: z.input<typeof idSchema>,
): Promise<ActionResult<AlunoView | null>> {
  try {
    const user = await getCurrentUser();
    assertPapel(user, ...PAPEIS);
    const { identificador } = idSchema.parse(input);
    return ok(await buscarAlunoPorIdentificador(identificador));
  } catch (err) {
    return fail(err);
  }
}
