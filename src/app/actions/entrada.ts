'use server';

import { z } from 'zod';
import { Papel, Unidade } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { getCurrentUser, assertPapel } from '@/lib/auth';
import {
  registrarEntrada,
  colocarEmProducao,
  editarItemPendente,
  type PendenteResumo,
  type ColocarEmProducaoResult,
} from '@/domain/entrada';
import { garantirAluno } from '@/domain/auth';
import {
  buscarItensPorNome,
  buscarAlunoPorIdentificador,
  listarItensPendentes,
  getAlertasItensPendentes,
  type ProdutoView,
  type AlunoView,
  type ItemPendenteView,
  type AlertaDiscrepanciaView,
} from '@/server/queries';
import { ok, fail, type ActionResult } from './_result';

const PAPEIS = [Papel.atendente_entrada, Papel.admin] as const;

const receberSchema = z.object({
  matricula: z.string().trim().min(1, 'Informe a matrícula ou email do aluno.').max(120),
  nome: z.string().trim().min(1, 'Informe o nome do item.').max(120),
  categoria: z.string().trim().min(1, 'Escolha a categoria.').max(60),
  valor: z.number().int('O valor deve ser inteiro.').positive('O valor deve ser positivo.').max(1_000_000),
  descricao: z.string().trim().max(500).optional(),
  unidade: z.nativeEnum(Unidade),
});

export type ReceberItemActionResult = PendenteResumo & {
  alunoNome: string;
  alunoMatricula: string;
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
    const pendente = await registrarEntrada(prisma, {
      alunoId: aluno.id,
      atendenteId: atendente.id,
      unidade: dados.unidade,
      nome: dados.nome,
      categoria: dados.categoria,
      valor: dados.valor,
      descricao: dados.descricao,
    });
    return ok({ ...pendente, alunoNome: aluno.nome, alunoMatricula: aluno.codigoCarteira, alunoCriado: criado });
  } catch (err) {
    return fail(err);
  }
}

const listarPendentesSchema = z.object({ unidade: z.nativeEnum(Unidade).optional() });

export async function listarPendentesAction(
  input: z.input<typeof listarPendentesSchema> = {},
): Promise<ActionResult<ItemPendenteView[]>> {
  try {
    const user = await getCurrentUser();
    assertPapel(user, ...PAPEIS);
    const { unidade } = listarPendentesSchema.parse(input);
    return ok(await listarItensPendentes(unidade));
  } catch (err) {
    return fail(err);
  }
}

export async function alertasPendentesAction(): Promise<ActionResult<AlertaDiscrepanciaView[]>> {
  try {
    const user = await getCurrentUser();
    assertPapel(user, ...PAPEIS);
    return ok(await getAlertasItensPendentes());
  } catch (err) {
    return fail(err);
  }
}

const editarPendenteSchema = z.object({
  id: z.string().min(1).max(60),
  nome: z.string().trim().min(1, 'Informe o nome do item.').max(120),
  categoria: z.string().trim().min(1, 'Escolha a categoria.').max(60),
  valor: z.number().int('O valor deve ser inteiro.').positive('O valor deve ser positivo.').max(1_000_000),
  quantidade: z.number().int().positive('A quantidade deve ser positiva.').max(100_000),
  descricao: z.string().trim().max(500).optional(),
  unidade: z.nativeEnum(Unidade),
});

export async function editarPendenteAction(
  input: z.input<typeof editarPendenteSchema>,
): Promise<ActionResult<PendenteResumo>> {
  try {
    const user = await getCurrentUser();
    assertPapel(user, ...PAPEIS);
    const { id, ...dados } = editarPendenteSchema.parse(input);
    return ok(await editarItemPendente(prisma, { id, ...dados }));
  } catch (err) {
    return fail(err);
  }
}

const pushSchema = z.object({ id: z.string().min(1) });

export async function pushProducaoAction(
  input: z.input<typeof pushSchema>,
): Promise<ActionResult<ColocarEmProducaoResult>> {
  try {
    const user = await getCurrentUser();
    assertPapel(user, ...PAPEIS);
    const { id } = pushSchema.parse(input);
    return ok(await colocarEmProducao(prisma, { pendenteId: id }));
  } catch (err) {
    return fail(err);
  }
}

export interface PushTodosResult {
  total: number;
  creditadoTotal: number;
  falhas: number;
  /** Ids efetivamente colocados em produção: a tela remove exatamente estes, sem refetch. */
  idsOk: string[];
}

const pushLoteSchema = z.object({
  unidade: z.nativeEnum(Unidade).optional(),
  /** Seleção explícita da tela. Ausente = todos os pendentes da unidade filtrada. */
  ids: z.array(z.string().min(1)).max(500).optional(),
});

export async function pushTodosProducaoAction(
  input: z.input<typeof pushLoteSchema> = {},
): Promise<ActionResult<PushTodosResult>> {
  try {
    const user = await getCurrentUser();
    assertPapel(user, ...PAPEIS);
    const { unidade, ids } = pushLoteSchema.parse(input);

    // Mesmo com ids vindos do client, relemos com `status: 'pendente'`: a seleção da tela
    // pode ter envelhecido, e o compare-and-set do domínio é a garantia final.
    const pendentes = await prisma.itemPendente.findMany({
      where: {
        status: 'pendente',
        ...(unidade ? { unidade } : {}),
        ...(ids && ids.length > 0 ? { id: { in: ids } } : {}),
      },
      select: { id: true },
      orderBy: { createdAt: 'asc' },
    });

    let creditadoTotal = 0;
    let falhas = 0;
    const idsOk: string[] = [];
    for (const { id } of pendentes) {
      try {
        const r = await colocarEmProducao(prisma, { pendenteId: id });
        idsOk.push(id);
        creditadoTotal += r.creditado;
      } catch {
        falhas += 1;
      }
    }
    return ok({ total: idsOk.length, creditadoTotal, falhas, idsOk });
  } catch (err) {
    return fail(err);
  }
}

const buscaNomeSchema = z.object({ nome: z.string().trim().min(1).max(120), unidade: z.nativeEnum(Unidade) });

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

const idSchema = z.object({ identificador: z.string().trim().min(1).max(120) });

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
