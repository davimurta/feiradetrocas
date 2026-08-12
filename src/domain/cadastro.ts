import type { PrismaClient, User } from '@prisma/client';
import { Papel, Prisma } from '@prisma/client';
import { DomainError } from '@/lib/errors';
import { hashSenha } from '@/lib/password';
import { gerarCodigoCarteira } from '@/lib/conviteGerador';
import type { PerfilCotemig } from '@/lib/cotemig-api';
import { ehMatricula, emailDeMatricula, unidadeDeMatricula } from './auth';
import { resgatarConvite } from './convite';

type Db = PrismaClient;

export function identificadorCotemig(usuario: string): string {
  return usuario.trim().toLowerCase();
}

function emailDoPerfil(perfil: PerfilCotemig, identificador: string): string {
  const institucional = perfil.emailInstitucional?.trim().toLowerCase();
  if (institucional && institucional.includes('@')) return institucional;
  return emailDeMatricula(identificador);
}

export async function cadastrarComVinculo(
  db: Db,
  input: { perfil: PerfilCotemig; senhaApp: string },
): Promise<User> {
  const identificador = identificadorCotemig(input.perfil.usuario);
  const senhaHash = await hashSenha(input.senhaApp);
  const nome = input.perfil.nome.trim().slice(0, 120);

  const vinculo = {
    senhaHash,
    provider: 'cotemig',
    cotemigId: identificador,
    cotemigUsuario: input.perfil.usuario.trim(),
    vinculadoEm: new Date(),
    pendente: false,
  };

  const existente = await db.user.findFirst({
    where: { OR: [{ cotemigId: identificador }, { codigoCarteira: identificador }] },
  });

  if (existente) {
    if (existente.bloqueado) {
      throw new DomainError('CONTA_BLOQUEADA', 'Sua conta está bloqueada.');
    }
    if (existente.cotemigId && existente.cotemigId !== identificador) {
      throw new DomainError(
        'CONFLITO_CADASTRO',
        'Esta matrícula já está vinculada a outra conta. Procure a organização da feira.',
      );
    }

    return db.user.update({
      where: { id: existente.id },
      data: {
        ...vinculo,
        nome: existente.nome?.trim() ? existente.nome : nome,
        sessionVersion: { increment: 1 },
      },
    });
  }

  const email = emailDoPerfil(input.perfil, identificador);
  const unidade = ehMatricula(identificador) ? unidadeDeMatricula(identificador) : 'barroca';

  try {
    return await db.user.create({
      data: {
        ...vinculo,
        nome,
        email,
        papel: Papel.participante,
        unidade,
        saldo: 0,
        codigoCarteira: identificador,
      },
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      throw new DomainError(
        'CONFLITO_CADASTRO',
        'Já existe uma conta usando estes dados. Procure a organização da feira.',
      );
    }
    throw err;
  }
}

export async function cadastrarComConvite(
  db: Db,
  input: { codigo: string; nome: string; email: string; senhaApp: string },
): Promise<User> {
  const email = input.email.trim().toLowerCase();

  const jaExiste = await db.user.findUnique({ where: { email }, select: { id: true } });
  if (jaExiste) {
    throw new DomainError('EMAIL_EM_USO', 'Já existe uma conta com esse email.');
  }

  const convite = await resgatarConvite(db, input.codigo);
  const senhaHash = await hashSenha(input.senhaApp);

  try {
    for (let tentativa = 0; tentativa < 10; tentativa++) {
      try {
        return await db.user.create({
          data: {
            nome: input.nome.trim().slice(0, 120),
            email,
            senhaHash,
            provider: 'convite',
            papel: Papel.participante,
            unidade: convite.unidade,
            pendente: false,
            saldo: 0,
            codigoCarteira: gerarCodigoCarteira(),
            conviteId: convite.id,
          },
        });
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
          const alvo = (err.meta?.target as string[] | undefined)?.join(',') ?? '';
          if (alvo.includes('codigo_carteira')) continue;
          throw new DomainError('EMAIL_EM_USO', 'Já existe uma conta com esse email.');
        }
        throw err;
      }
    }
    throw new DomainError('CONFLITO_CADASTRO', 'Não foi possível gerar uma carteira livre.');
  } catch (err) {
    await db.convite
      .updateMany({ where: { id: convite.id, usos: { gt: 0 } }, data: { usos: { decrement: 1 } } })
      .catch(() => null);
    throw err;
  }
}
