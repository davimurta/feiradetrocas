import 'server-only';
import { prisma } from '@/lib/prisma';

export interface TentativaView {
  id: string;
  escopo: string;
  identificador: string;
  ip: string | null;
  sucesso: boolean;
  motivo: string | null;
  createdAt: Date;
}

export interface BloqueioView {
  chave: string;
  escopo: string;
  identificador: string;
  tipo: string;
  falhas: number;
  bloqueadoAte: Date;
}

export interface AcessosView {
  tentativas: TentativaView[];
  bloqueios: BloqueioView[];
  resumo: { total: number; falhas: number; identificadoresDistintos: number };
}

const LIMITE = 200;

export async function getAcessos(filtro: {
  busca?: string;
  apenasFalhas?: boolean;
  horas?: number;
} = {}): Promise<AcessosView> {
  const desde = new Date(Date.now() - (filtro.horas ?? 24) * 3600 * 1000);
  const busca = filtro.busca?.trim().toLowerCase();

  const where = {
    createdAt: { gte: desde },
    ...(filtro.apenasFalhas ? { sucesso: false } : {}),
    ...(busca ? { identificador: { contains: busca } } : {}),
  };

  const [tentativas, agregado, distintos, baldes] = await Promise.all([
    prisma.tentativaAuth.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: LIMITE,
      select: {
        id: true,
        escopo: true,
        identificador: true,
        ip: true,
        sucesso: true,
        motivo: true,
        createdAt: true,
      },
    }),
    prisma.tentativaAuth.groupBy({ by: ['sucesso'], where, _count: { _all: true } }),
    prisma.tentativaAuth.findMany({ where, distinct: ['identificador'], select: { identificador: true } }),
    prisma.baldeRate.findMany({
      where: { bloqueadoAte: { gt: new Date() } },
      orderBy: { bloqueadoAte: 'desc' },
      take: 100,
    }),
  ]);

  const total = agregado.reduce((soma, linha) => soma + linha._count._all, 0);
  const falhas = agregado.find((linha) => !linha.sucesso)?._count._all ?? 0;

  return {
    tentativas,
    bloqueios: baldes.map((b) => {
      const [escopo, tipo, ...resto] = b.chave.split(':');
      return {
        chave: b.chave,
        escopo,
        tipo,
        identificador: resto.join(':'),
        falhas: b.falhas,
        bloqueadoAte: b.bloqueadoAte as Date,
      };
    }),
    resumo: { total, falhas, identificadoresDistintos: distintos.length },
  };
}
