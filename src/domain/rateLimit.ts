import type { PrismaClient } from '@prisma/client';
import { Prisma } from '@prisma/client';
import {
  politicaIdentidade,
  politicaIp,
  rateAtivo,
  rateIpAtivo,
  retencaoTentativasHoras,
  type EscopoRate,
  type PoliticaRate,
} from '@/lib/rateLimitConfig';

type Db = PrismaClient;

export interface EstadoRate {
  bloqueado: boolean;
  segundosRestantes: number;
}

const LIVRE: EstadoRate = { bloqueado: false, segundosRestantes: 0 };

export function normalizarIdentificador(valor: string): string {
  return valor.trim().toLowerCase().slice(0, 160);
}

function chave(escopo: EscopoRate, tipo: 'id' | 'ip', valor: string): string {
  return `${escopo}:${tipo}:${normalizarIdentificador(valor)}`;
}

function restantes(bloqueadoAte: Date | null | undefined): number {
  if (!bloqueadoAte) return 0;
  return Math.max(0, Math.ceil((bloqueadoAte.getTime() - Date.now()) / 1000));
}

async function lerBalde(db: Db, chaves: string[]): Promise<EstadoRate> {
  if (chaves.length === 0) return LIVRE;

  const linhas = await db.baldeRate.findMany({
    where: { chave: { in: chaves }, bloqueadoAte: { gt: new Date() } },
    select: { bloqueadoAte: true },
  });

  const segundos = linhas.reduce((maior, linha) => Math.max(maior, restantes(linha.bloqueadoAte)), 0);
  return segundos > 0 ? { bloqueado: true, segundosRestantes: segundos } : LIVRE;
}

async function registrarFalha(
  db: Db,
  chaveBalde: string,
  escopo: EscopoRate,
  politica: PoliticaRate,
): Promise<EstadoRate> {
  const janela = `${politica.janelaSegundos} seconds`;

  const novasFalhas = Prisma.sql`
    CASE
      WHEN "baldes_rate"."janela_inicio" < now() - ${janela}::interval THEN 1
      ELSE "baldes_rate"."falhas" + 1
    END`;

  const linhas = await db.$queryRaw<{ falhas: number; bloqueado_ate: Date | null }[]>(Prisma.sql`
    INSERT INTO "baldes_rate" ("chave", "escopo", "falhas", "janela_inicio", "bloqueado_ate", "atualizado_em")
    VALUES (${chaveBalde}, ${escopo}, 1, now(), NULL, now())
    ON CONFLICT ("chave") DO UPDATE SET
      "falhas" = ${novasFalhas},
      "janela_inicio" = CASE
        WHEN "baldes_rate"."janela_inicio" < now() - ${janela}::interval THEN now()
        ELSE "baldes_rate"."janela_inicio"
      END,
      "bloqueado_ate" = CASE
        WHEN ${novasFalhas} >= ${politica.falhas}
          THEN now() + make_interval(secs => least(
            ${politica.bloqueioBaseSegundos}::double precision * power(2, ${novasFalhas} - ${politica.falhas}),
            ${politica.bloqueioMaximoSegundos}::double precision
          ))
        ELSE "baldes_rate"."bloqueado_ate"
      END,
      "atualizado_em" = now()
    RETURNING "falhas", "bloqueado_ate"
  `);

  const linha = linhas[0];
  if (!linha) return LIVRE;

  const segundos = restantes(linha.bloqueado_ate);
  return segundos > 0 ? { bloqueado: true, segundosRestantes: segundos } : LIVRE;
}

export async function verificarRate(
  db: Db,
  entrada: { escopo: EscopoRate; identificador: string; ip?: string | null },
): Promise<EstadoRate> {
  if (!rateAtivo()) return LIVRE;

  const chaves = [chave(entrada.escopo, 'id', entrada.identificador)];
  if (rateIpAtivo() && entrada.ip) chaves.push(chave(entrada.escopo, 'ip', entrada.ip));

  return lerBalde(db, chaves);
}

export async function registrarTentativa(
  db: Db,
  entrada: {
    escopo: EscopoRate;
    identificador: string;
    ip?: string | null;
    sucesso: boolean;
    motivo?: string | null;
  },
): Promise<EstadoRate> {
  const identificador = normalizarIdentificador(entrada.identificador);

  await db.tentativaAuth.create({
    data: {
      escopo: entrada.escopo,
      identificador,
      ip: entrada.ip ?? null,
      sucesso: entrada.sucesso,
      motivo: entrada.motivo ?? null,
    },
  });

  if (!rateAtivo()) return LIVRE;

  if (entrada.sucesso) {
    await limparBaldes(db, entrada.escopo, identificador, entrada.ip);
    return LIVRE;
  }

  const porIdentidade = await registrarFalha(
    db,
    chave(entrada.escopo, 'id', identificador),
    entrada.escopo,
    politicaIdentidade(entrada.escopo),
  );

  let porIp: EstadoRate = LIVRE;
  if (rateIpAtivo() && entrada.ip) {
    porIp = await registrarFalha(
      db,
      chave(entrada.escopo, 'ip', entrada.ip),
      entrada.escopo,
      politicaIp(entrada.escopo),
    );
  }

  const segundos = Math.max(porIdentidade.segundosRestantes, porIp.segundosRestantes);
  return segundos > 0 ? { bloqueado: true, segundosRestantes: segundos } : LIVRE;
}

async function limparBaldes(
  db: Db,
  escopo: EscopoRate,
  identificador: string,
  ip?: string | null,
): Promise<void> {
  const chaves = [chave(escopo, 'id', identificador)];
  if (ip) chaves.push(chave(escopo, 'ip', ip));
  await db.baldeRate.deleteMany({ where: { chave: { in: chaves } } });
}

export async function desbloquearIdentificador(
  db: Db,
  identificador: string,
): Promise<{ removidos: number }> {
  const alvo = normalizarIdentificador(identificador);
  const r = await db.baldeRate.deleteMany({
    where: {
      chave: {
        in: ['login', 'cadastro', 'convite'].flatMap((e) => [`${e}:id:${alvo}`, `${e}:ip:${alvo}`]),
      },
    },
  });
  return { removidos: r.count };
}

export async function limparExpirados(db: Db): Promise<{ baldes: number; tentativas: number }> {
  const corte = new Date(Date.now() - retencaoTentativasHoras() * 3600 * 1000);
  const agora = new Date();

  const [baldes, tentativas] = await Promise.all([
    db.baldeRate.deleteMany({
      where: {
        atualizadoEm: { lt: corte },
        OR: [{ bloqueadoAte: null }, { bloqueadoAte: { lt: agora } }],
      },
    }),
    db.tentativaAuth.deleteMany({ where: { createdAt: { lt: corte } } }),
  ]);

  return { baldes: baldes.count, tentativas: tentativas.count };
}
