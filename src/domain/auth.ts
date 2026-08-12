import type { PrismaClient, User, Unidade } from '@prisma/client';
import { Papel, Prisma } from '@prisma/client';
import { DomainError } from '@/lib/errors';
import { hashSenha, verificarSenha, precisaRehash, consumirTempoDeSenha } from '@/lib/password';

type Db = PrismaClient;

export const DOMINIO_ALUNO = 'aluno.cotemig.com.br';


export function carteiraDeEmail(email: string): string {
  return email.split('@')[0].trim().toLowerCase();
}

export function emailDeMatricula(matricula: string): string {
  return `${matricula.trim().toLowerCase()}@${DOMINIO_ALUNO}`;
}

export function ehMatricula(prefixo: string): boolean {
  return /^\d+$/.test(prefixo);
}


export function unidadeDeMatricula(prefixo: string): Unidade {
  return prefixo.startsWith('2') ? 'floresta' : 'barroca';
}

export function normalizarIdentificador(identificador: string): { email: string; carteira: string } {
  const v = identificador.trim().toLowerCase();
  const email = v.includes('@') ? v : emailDeMatricula(v);
  return { email, carteira: carteiraDeEmail(email) };
}

function nomeDeEmail(email: string): string {
  const prefixo = carteiraDeEmail(email);
  return prefixo.replace(/[._-]+/g, ' ').replace(/\d+/g, '').trim() || prefixo;
}

async function provisionar(
  db: Db,
  input: { email: string; nome?: string; senhaHash?: string | null; provider: string },
): Promise<User> {
  const base = carteiraDeEmail(input.email);
  const matricula = ehMatricula(base);
  const unidade = matricula ? unidadeDeMatricula(base) : 'barroca';
  const pendente = !matricula;

  for (let tentativa = 0; ; tentativa++) {
    const codigoCarteira = tentativa === 0 ? base : `${base}-${tentativa + 1}`;
    try {
      return await db.user.create({
        data: {
          email: input.email,
          nome: input.nome?.trim() || nomeDeEmail(input.email),
          senhaHash: input.senhaHash ?? null,
          provider: input.provider,
          papel: Papel.participante,
          unidade,
          pendente,
          saldo: 0,
          codigoCarteira,
        },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        const alvo = (err.meta?.target as string[] | undefined)?.join(',') ?? '';
        if (alvo.includes('email')) {
          const existente = await db.user.findUnique({ where: { email: input.email } });
          if (existente) return existente;
        }
        if (tentativa < 10) continue;
      }
      throw err;
    }
  }
}

function credencialInvalida(): DomainError {
  return new DomainError('CREDENCIAL_INVALIDA', 'Email ou senha incorretos.');
}

export async function entrarComSenha(
  db: Db,
  input: { email: string; senha: string },
): Promise<User> {
  const email = input.email.trim().toLowerCase();
  const existente = await db.user.findUnique({ where: { email } });

  if (!existente || !existente.senhaHash) {
    await consumirTempoDeSenha(input.senha);
    throw credencialInvalida();
  }

  if (!(await verificarSenha(input.senha, existente.senhaHash))) {
    throw credencialInvalida();
  }

  if (existente.bloqueado) {
    throw new DomainError('CONTA_BLOQUEADA', 'Sua conta está bloqueada.');
  }

  if (precisaRehash(existente.senhaHash)) {
    const senhaHash = await hashSenha(input.senha);
    return db.user.update({ where: { id: existente.id }, data: { senhaHash } });
  }

  return existente;
}

export async function definirSenhaLocal(
  db: Db,
  input: { userId: string; senha: string },
): Promise<User> {
  const senhaHash = await hashSenha(input.senha);
  return db.user.update({
    where: { id: input.userId },
    data: { senhaHash, provider: 'password', sessionVersion: { increment: 1 } },
  });
}

export async function garantirAluno(
  db: Db,
  input: { identificador: string; nome?: string },
): Promise<{ user: User; criado: boolean }> {
  const { email, carteira } = normalizarIdentificador(input.identificador);
  const existente = await db.user.findFirst({
    where: { OR: [{ email }, { codigoCarteira: carteira }] },
  });
  if (existente) return { user: existente, criado: false };
  const user = await provisionar(db, { email, nome: input.nome, provider: 'preprovisioned' });
  return { user, criado: true };
}

export async function entrarComGoogle(
  db: Db,
  input: { email: string; nome?: string },
): Promise<User> {
  const email = input.email.trim().toLowerCase();
  const existente = await db.user.findUnique({ where: { email } });
  if (existente) {
    if (existente.bloqueado) throw new DomainError('CONTA_BLOQUEADA', 'Sua conta está bloqueada.');
    return existente;
  }
  return provisionar(db, { email, nome: input.nome, provider: 'google' });
}
