import type { PrismaClient, Unidade, Convite } from '@prisma/client';
import { Prisma } from '@prisma/client';
import { DomainError } from '@/lib/errors';
import { normalizarCodigo } from '@/lib/convite';
import { gerarCodigo } from '@/lib/conviteGerador';

type Db = PrismaClient;

export interface ConviteView {
  id: string;
  codigo: string;
  descricao: string | null;
  unidade: Unidade;
  expiraEm: Date;
  maxUsos: number | null;
  usos: number;
  ativo: boolean;
  valido: boolean;
  criadoPor: string;
  createdAt: Date;
}

function paraView(c: Convite & { criadoPor: { nome: string } }): ConviteView {
  const esgotado = c.maxUsos !== null && c.usos >= c.maxUsos;
  return {
    id: c.id,
    codigo: c.codigo,
    descricao: c.descricao,
    unidade: c.unidade,
    expiraEm: c.expiraEm,
    maxUsos: c.maxUsos,
    usos: c.usos,
    ativo: c.ativo,
    valido: c.ativo && !esgotado && c.expiraEm > new Date(),
    criadoPor: c.criadoPor.nome,
    createdAt: c.createdAt,
  };
}

export async function criarConvite(
  db: Db,
  input: {
    criadoPorId: string;
    unidade: Unidade;
    descricao?: string | null;
    validadeHoras: number;
    maxUsos?: number | null;
  },
): Promise<ConviteView> {
  const expiraEm = new Date(Date.now() + input.validadeHoras * 3600 * 1000);

  for (let tentativa = 0; tentativa < 10; tentativa++) {
    try {
      const criado = await db.convite.create({
        data: {
          codigo: normalizarCodigo(gerarCodigo()),
          descricao: input.descricao?.trim() || null,
          unidade: input.unidade,
          expiraEm,
          maxUsos: input.maxUsos ?? null,
          criadoPorId: input.criadoPorId,
        },
        include: { criadoPor: { select: { nome: true } } },
      });
      return paraView(criado);
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') continue;
      throw err;
    }
  }

  throw new DomainError('CODIGO_DUPLICADO', 'Não foi possível gerar um código livre. Tente de novo.');
}

export async function listarConvites(db: Db): Promise<ConviteView[]> {
  const linhas = await db.convite.findMany({
    orderBy: { createdAt: 'desc' },
    take: 200,
    include: { criadoPor: { select: { nome: true } } },
  });
  return linhas.map(paraView);
}

export async function definirConviteAtivo(
  db: Db,
  input: { id: string; ativo: boolean },
): Promise<ConviteView> {
  const atualizado = await db.convite
    .update({
      where: { id: input.id },
      data: { ativo: input.ativo },
      include: { criadoPor: { select: { nome: true } } },
    })
    .catch(() => null);

  if (!atualizado) throw new DomainError('CONVITE_INVALIDO', 'Convite não encontrado.');
  return paraView(atualizado);
}

export async function estenderConvite(
  db: Db,
  input: { id: string; horas: number },
): Promise<ConviteView> {
  const atual = await db.convite.findUnique({ where: { id: input.id } });
  if (!atual) throw new DomainError('CONVITE_INVALIDO', 'Convite não encontrado.');

  const base = atual.expiraEm > new Date() ? atual.expiraEm : new Date();
  const atualizado = await db.convite.update({
    where: { id: input.id },
    data: { expiraEm: new Date(base.getTime() + input.horas * 3600 * 1000) },
    include: { criadoPor: { select: { nome: true } } },
  });
  return paraView(atualizado);
}

export interface ConviteResgatado {
  id: string;
  unidade: Unidade;
}

export async function resgatarConvite(db: Db, codigo: string): Promise<ConviteResgatado> {
  const normalizado = normalizarCodigo(codigo);
  if (!normalizado) throw new DomainError('CONVITE_INVALIDO', 'Código de convite inválido.');

  const linhas = await db.$queryRaw<{ id: string; unidade: Unidade }[]>(Prisma.sql`
    UPDATE "convites"
       SET "usos" = "usos" + 1
     WHERE "codigo" = ${normalizado}
       AND "ativo" = true
       AND "expira_em" > now()
       AND ("max_usos" IS NULL OR "usos" < "max_usos")
    RETURNING "id", "unidade"
  `);

  const convite = linhas[0];
  if (!convite) throw new DomainError('CONVITE_INVALIDO', 'Código de convite inválido ou expirado.');

  return { id: convite.id, unidade: convite.unidade };
}
