import { Papel } from '@prisma/client';
import { ZodError } from 'zod';
import { getCurrentUser, assertPapel } from '@/lib/auth';
import { isDomainError } from '@/lib/errors';
import { filtroDaQuery } from '@/lib/filtroMetricas';
import { DATASETS, montarTabela, paraCsv, paraXlsx, type Dataset } from '@/server/export';

export const dynamic = 'force-dynamic';

function carimbo(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
}

export async function GET(req: Request) {
  try {
    assertPapel(await getCurrentUser(), Papel.admin);

    const params = new URL(req.url).searchParams;
    const filtro = filtroDaQuery(params);
    const formato = params.get('formato') === 'csv' ? 'csv' : 'xlsx';
    const pedido = params.get('dataset') ?? 'tudo';

    if (formato === 'csv') {
      const dataset = (DATASETS as readonly string[]).includes(pedido)
        ? (pedido as Dataset)
        : 'transacoes';
      const tabela = await montarTabela(dataset, filtro);
      return new Response(paraCsv(tabela), {
        headers: {
          'content-type': 'text/csv; charset=utf-8',
          'content-disposition': `attachment; filename="feira-${dataset}-${carimbo()}.csv"`,
          'cache-control': 'no-store',
        },
      });
    }

    const alvos: readonly Dataset[] =
      pedido === 'tudo' || !(DATASETS as readonly string[]).includes(pedido)
        ? DATASETS
        : [pedido as Dataset];

    const tabelas = [];
    for (const alvo of alvos) tabelas.push(await montarTabela(alvo, filtro));

    const buffer = await paraXlsx(tabelas);
    return new Response(new Uint8Array(buffer), {
      headers: {
        'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'content-disposition': `attachment; filename="feira-metricas-${carimbo()}.xlsx"`,
        'cache-control': 'no-store',
      },
    });
  } catch (err) {
    if (isDomainError(err)) {
      const status = err.code === 'NAO_AUTENTICADO' ? 401 : 403;
      return Response.json({ code: err.code, message: err.message }, { status });
    }
    if (err instanceof ZodError) {
      return Response.json({ code: 'VALIDACAO', message: 'Filtro inválido.' }, { status: 400 });
    }
    throw err;
  }
}
