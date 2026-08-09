'use client';

import { useEffect, useState } from 'react';
import {
  ResponsiveContainer,
  ComposedChart,
  AreaChart,
  Area,
  BarChart,
  Bar,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Cell,
  LabelList,
  Line,
} from 'recharts';
import type { MetricasView } from '@/server/metricas';
import {
  CATEGORICA,
  SEQUENCIAL,
  COR_STATUS,
  GRID,
  EIXO,
  numero,
  duracao,
  rotuloBalde,
  rotuloBaldeCompleto,
} from './paleta';
import styles from './metricas.module.css';

// Specs fixas de marca — barra fina com ponta arredondada, linha de 2px, grade discreta.
const BARRA_MAX = 24;
const EIXO_TICK = { fontSize: 11, fill: EIXO } as const;
const eixoBase = { tickLine: false, axisLine: { stroke: GRID }, tick: EIXO_TICK } as const;

interface SerieDica {
  nome: string;
  cor: string;
  valor: number | string;
}

function Dica({ titulo, series }: { titulo: string; series: SerieDica[] }) {
  return (
    <div className={styles.dica}>
      <div className={styles.dicaTitulo}>{titulo}</div>
      {series.map((s) => (
        <div key={s.nome} className={styles.dicaLinha}>
          <span className={styles.dicaMarca} style={{ background: s.cor }} aria-hidden />
          <span>{s.nome}</span>
          <span className={styles.dicaValor}>
            {typeof s.valor === 'number' ? numero.format(s.valor) : s.valor}
          </span>
        </div>
      ))}
    </div>
  );
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function dicaRecharts(rotulo?: (label: string) => string) {
  return function Conteudo({ active, payload, label }: any) {
    if (!active || !payload?.length) return null;
    return (
      <Dica
        titulo={rotulo ? rotulo(String(label)) : String(label)}
        series={payload.map((p: any) => ({
          nome: String(p.name),
          cor: p.color ?? p.fill,
          valor: p.value as number,
        }))}
      />
    );
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

function Legenda({ itens }: { itens: { nome: string; cor: string }[] }) {
  return (
    <div className={styles.legenda}>
      {itens.map((i) => (
        <span key={i.nome} className={styles.legendaItem}>
          <span className={styles.dicaMarca} style={{ background: i.cor }} aria-hidden />
          {i.nome}
        </span>
      ))}
    </div>
  );
}

/**
 * Um gráfico + sua tabela. A tabela não é enfeite: é o canal de leitura para quem
 * não distingue as cores, para leitor de tela e para os valores que o gráfico não
 * rotula ponto a ponto.
 */
function Cartao({
  titulo,
  subtitulo,
  destaque,
  altura = 240,
  largo,
  vazio,
  legenda,
  tabela,
  children,
}: {
  titulo: string;
  subtitulo?: string;
  destaque?: string;
  altura?: number;
  largo?: boolean;
  vazio?: boolean;
  legenda?: { nome: string; cor: string }[];
  tabela?: { colunas: string[]; linhas: (string | number)[][] };
  children: React.ReactNode;
}) {
  return (
    <section className={largo ? `${styles.cartao} ${styles.largo}` : styles.cartao}>
      <div className={styles.cartaoTopo}>
        <h3 className={styles.titulo}>{titulo}</h3>
        {destaque && <span className={styles.destaque}>{destaque}</span>}
      </div>
      {subtitulo && <p className={styles.subtitulo}>{subtitulo}</p>}
      {legenda && <Legenda itens={legenda} />}
      <div className={styles.plot} style={{ height: altura }}>
        {vazio ? (
          <div className={styles.vazio}>Sem dados no período selecionado.</div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            {children as React.ReactElement}
          </ResponsiveContainer>
        )}
      </div>
      {tabela && tabela.linhas.length > 0 && (
        <details className={styles.tabelaToggle}>
          <summary>Ver tabela</summary>
          <div className={styles.tabelaRolagem}>
            <table className={styles.tabela}>
              <thead>
                <tr>
                  {tabela.colunas.map((c) => (
                    <th key={c} scope="col">
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {tabela.linhas.map((l, i) => (
                  <tr key={i}>
                    {l.map((celula, j) => (
                      <td key={j}>{typeof celula === 'number' ? numero.format(celula) : celula}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </section>
  );
}

export function AdminCharts({ metricas }: { metricas: MetricasView }) {
  const [montado, setMontado] = useState(false);
  useEffect(() => setMontado(true), []);

  const g = metricas.filtro.granularidade;
  const eixoTempo = (v: string) => rotuloBalde(v, g);

  if (!montado) {
    return (
      <div className={styles.grade}>
        {['Volume de transações', 'Itens mais trocados', 'Fichas', 'Atendentes'].map((t) => (
          <Cartao key={t} titulo={t} vazio>
            <div />
          </Cartao>
        ))}
      </div>
    );
  }

  const serieVazia = metricas.serie.every((p) => p.transacoes === 0);
  const fichas = [
    { label: 'Emitidas', value: metricas.fichas.emitidas, cor: SEQUENCIAL[2] },
    { label: 'Gastas', value: metricas.fichas.gastas, cor: SEQUENCIAL[1] },
    { label: 'Em circulação', value: metricas.fichas.emCirculacao, cor: SEQUENCIAL[0] },
  ];
  const atendentes = metricas.atendentes.slice(0, 8);
  const categorias = metricas.categorias.slice(0, 8);
  const discrepanciasTotal = metricas.discrepancias.reduce(
    (s, d) => s + d.pendentes + d.catalogo,
    0,
  );

  return (
    <div className={styles.grade}>
      <Cartao
        titulo="Volume de transações no tempo"
        subtitulo={`Fichas movimentadas por ${g === 'hora' ? 'hora' : 'dia'}; a linha conta as transações.`}
        largo
        altura={280}
        vazio={serieVazia}
        legenda={[
          { nome: 'Fichas creditadas (entrada)', cor: CATEGORICA[0] },
          { nome: 'Fichas gastas (compra)', cor: CATEGORICA[1] },
          { nome: 'Transações', cor: CATEGORICA[3] },
        ]}
        tabela={{
          colunas: ['Período', 'Creditadas', 'Gastas', 'Transações'],
          linhas: metricas.serie.map((p) => [
            rotuloBaldeCompleto(p.balde, g),
            p.creditos,
            p.debitos,
            p.transacoes,
          ]),
        }}
      >
        <ComposedChart data={metricas.serie} margin={{ top: 8, right: 12, left: -8, bottom: 0 }}>
          <CartesianGrid stroke={GRID} strokeWidth={1} vertical={false} />
          <XAxis dataKey="balde" tickFormatter={eixoTempo} minTickGap={24} {...eixoBase} />
          <YAxis allowDecimals={false} width={44} {...eixoBase} axisLine={false} />
          <Tooltip
            content={dicaRecharts((l) => rotuloBaldeCompleto(l, g))}
            cursor={{ stroke: GRID, strokeWidth: 1 }}
          />
          <Area
            type="monotone"
            dataKey="creditos"
            name="Fichas creditadas"
            stroke={CATEGORICA[0]}
            strokeWidth={2}
            fill={CATEGORICA[0]}
            fillOpacity={0.1}
            dot={false}
            activeDot={{ r: 4, strokeWidth: 2, stroke: '#fff' }}
          />
          <Area
            type="monotone"
            dataKey="debitos"
            name="Fichas gastas"
            stroke={CATEGORICA[1]}
            strokeWidth={2}
            fill={CATEGORICA[1]}
            fillOpacity={0.1}
            dot={false}
            activeDot={{ r: 4, strokeWidth: 2, stroke: '#fff' }}
          />
          <Line
            type="monotone"
            dataKey="transacoes"
            name="Transações"
            stroke={CATEGORICA[3]}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, strokeWidth: 2, stroke: '#fff' }}
          />
        </ComposedChart>
      </Cartao>

      <Cartao
        titulo="Itens mais trocados"
        subtitulo="Unidades vendidas no período (top 10)."
        altura={Math.max(200, metricas.rankingItens.length * 30 + 24)}
        vazio={metricas.rankingItens.length === 0}
        tabela={{
          colunas: ['Item', 'Categoria', 'Unidades', 'Fichas'],
          linhas: metricas.rankingItens.map((i) => [i.nome, i.categoria, i.unidades, i.fichas]),
        }}
      >
        <BarChart
          data={metricas.rankingItens}
          layout="vertical"
          margin={{ top: 4, right: 40, left: 8, bottom: 4 }}
          barCategoryGap={4}
        >
          <XAxis type="number" hide allowDecimals={false} />
          <YAxis type="category" dataKey="nome" width={110} {...eixoBase} axisLine={false} />
          <Tooltip content={dicaRecharts()} cursor={{ fill: 'rgba(32,38,26,0.04)' }} />
          <Bar
            dataKey="unidades"
            name="Unidades vendidas"
            fill={SEQUENCIAL[1]}
            radius={[0, 4, 4, 0]}
            maxBarSize={BARRA_MAX}
          >
            <LabelList dataKey="unidades" position="right" style={{ fontSize: 11, fill: EIXO }} />
          </Bar>
        </BarChart>
      </Cartao>

      <Cartao
        titulo="Fichas: emitidas, gastas e em circulação"
        subtitulo="Emitidas e gastas no período; circulação é o saldo somado agora."
        destaque={`${numero.format(metricas.fichas.ajustes)} em ajustes`}
        vazio={fichas.every((f) => f.value === 0)}
        tabela={{
          colunas: ['Indicador', 'Fichas'],
          linhas: [
            ...fichas.map((f) => [f.label, f.value] as (string | number)[]),
            ['Ajustes manuais (líquido)', metricas.fichas.ajustes],
          ],
        }}
      >
        <BarChart
          data={fichas}
          layout="vertical"
          margin={{ top: 4, right: 56, left: 8, bottom: 4 }}
          barCategoryGap={10}
        >
          <XAxis type="number" hide />
          <YAxis type="category" dataKey="label" width={104} {...eixoBase} axisLine={false} />
          <Tooltip content={dicaRecharts()} cursor={{ fill: 'rgba(32,38,26,0.04)' }} />
          <Bar dataKey="value" name="Fichas" radius={[0, 4, 4, 0]} maxBarSize={BARRA_MAX}>
            {fichas.map((f) => (
              <Cell key={f.label} fill={f.cor} />
            ))}
            <LabelList dataKey="value" position="right" style={{ fontSize: 11, fill: EIXO }} />
          </Bar>
        </BarChart>
      </Cartao>

      <Cartao
        titulo="Atividade por atendente"
        subtitulo="Itens recebidos na recepção e vendas aprovadas no stand."
        altura={Math.max(200, atendentes.length * 38 + 24)}
        vazio={atendentes.length === 0}
        legenda={[
          { nome: 'Itens recebidos', cor: CATEGORICA[0] },
          { nome: 'Vendas aprovadas', cor: CATEGORICA[1] },
        ]}
        tabela={{
          colunas: ['Atendente', 'Papel', 'Recebidos', 'Creditados', 'Vendas', 'Fichas vendidas'],
          linhas: metricas.atendentes.map((a) => [
            a.nome,
            a.papel,
            a.recebidos,
            a.creditados,
            a.pedidosAprovados,
            a.fichasVendidas,
          ]),
        }}
      >
        <BarChart
          data={atendentes}
          layout="vertical"
          margin={{ top: 4, right: 40, left: 8, bottom: 4 }}
          barCategoryGap={10}
          barGap={2}
        >
          <XAxis type="number" hide allowDecimals={false} />
          <YAxis type="category" dataKey="nome" width={110} {...eixoBase} axisLine={false} />
          <Tooltip content={dicaRecharts()} cursor={{ fill: 'rgba(32,38,26,0.04)' }} />
          <Bar
            dataKey="recebidos"
            name="Itens recebidos"
            fill={CATEGORICA[0]}
            radius={[0, 4, 4, 0]}
            maxBarSize={14}
          />
          <Bar
            dataKey="pedidosAprovados"
            name="Vendas aprovadas"
            fill={CATEGORICA[1]}
            radius={[0, 4, 4, 0]}
            maxBarSize={14}
          />
        </BarChart>
      </Cartao>

      <Cartao
        titulo="Pedidos por status"
        subtitulo="Aprovação em duas pontas: quanto trava, quanto é recusado."
        destaque={`recusa ${(metricas.pedidos.taxaRecusa * 100).toFixed(1)}% · aprovação em ${duracao(
          metricas.pedidos.segundosMedioAprovacao,
        )}`}
        vazio={metricas.pedidos.total === 0}
        tabela={{
          colunas: ['Status', 'Pedidos'],
          linhas: metricas.pedidos.porStatus.map((s) => [s.label, s.value]),
        }}
      >
        <BarChart
          data={metricas.pedidos.porStatus}
          layout="vertical"
          margin={{ top: 4, right: 48, left: 8, bottom: 4 }}
          barCategoryGap={8}
        >
          <XAxis type="number" hide allowDecimals={false} />
          <YAxis type="category" dataKey="label" width={92} {...eixoBase} axisLine={false} />
          <Tooltip content={dicaRecharts()} cursor={{ fill: 'rgba(32,38,26,0.04)' }} />
          <Bar dataKey="value" name="Pedidos" radius={[0, 4, 4, 0]} maxBarSize={BARRA_MAX}>
            {metricas.pedidos.porStatus.map((s) => (
              <Cell key={s.label} fill={COR_STATUS[s.label] ?? CATEGORICA[0]} />
            ))}
            <LabelList dataKey="value" position="right" style={{ fontSize: 11, fill: EIXO }} />
          </Bar>
        </BarChart>
      </Cartao>

      <Cartao
        titulo="Estoque × vendas por categoria"
        subtitulo="O que está parado no catálogo contra o que realmente saiu."
        altura={Math.max(200, categorias.length * 38 + 24)}
        vazio={categorias.length === 0}
        legenda={[
          { nome: 'Em estoque', cor: CATEGORICA[0] },
          { nome: 'Vendidos no período', cor: CATEGORICA[1] },
        ]}
        tabela={{
          colunas: ['Categoria', 'Em estoque', 'Vendidos'],
          linhas: metricas.categorias.map((c) => [c.label, c.estoque, c.vendidos]),
        }}
      >
        <BarChart
          data={categorias}
          layout="vertical"
          margin={{ top: 4, right: 40, left: 8, bottom: 4 }}
          barCategoryGap={10}
          barGap={2}
        >
          <XAxis type="number" hide allowDecimals={false} />
          <YAxis type="category" dataKey="label" width={110} {...eixoBase} axisLine={false} />
          <Tooltip content={dicaRecharts()} cursor={{ fill: 'rgba(32,38,26,0.04)' }} />
          <Bar dataKey="estoque" name="Em estoque" fill={CATEGORICA[0]} radius={[0, 4, 4, 0]} maxBarSize={14} />
          <Bar dataKey="vendidos" name="Vendidos" fill={CATEGORICA[1]} radius={[0, 4, 4, 0]} maxBarSize={14} />
        </BarChart>
      </Cartao>

      <Cartao
        titulo="Distribuição de fichas entre os alunos"
        subtitulo="Quantos alunos estão em cada faixa de saldo."
        vazio={metricas.distribuicaoSaldo.every((f) => f.value === 0)}
        tabela={{
          colunas: ['Faixa de saldo', 'Alunos'],
          linhas: metricas.distribuicaoSaldo.map((f) => [f.label, f.value]),
        }}
      >
        <AreaChart data={metricas.distribuicaoSaldo} margin={{ top: 8, right: 12, left: -10, bottom: 0 }}>
          <CartesianGrid stroke={GRID} strokeWidth={1} vertical={false} />
          <XAxis dataKey="label" {...eixoBase} />
          <YAxis allowDecimals={false} width={40} {...eixoBase} axisLine={false} />
          <Tooltip content={dicaRecharts()} cursor={{ stroke: GRID, strokeWidth: 1 }} />
          <Area
            type="monotone"
            dataKey="value"
            name="Alunos"
            stroke={SEQUENCIAL[2]}
            strokeWidth={2}
            fill={SEQUENCIAL[2]}
            fillOpacity={0.1}
            dot={{ r: 4, strokeWidth: 2, stroke: '#fff', fill: SEQUENCIAL[2] }}
          />
        </AreaChart>
      </Cartao>

      <Cartao
        titulo="Reportes por motivo"
        subtitulo="Denúncias abertas pelo stand no período."
        vazio={metricas.reportesPorMotivo.length === 0}
        tabela={{
          colunas: ['Motivo', 'Reportes'],
          linhas: metricas.reportesPorMotivo.map((r) => [r.label, r.value]),
        }}
      >
        <BarChart
          data={metricas.reportesPorMotivo}
          layout="vertical"
          margin={{ top: 4, right: 48, left: 8, bottom: 4 }}
          barCategoryGap={8}
        >
          <XAxis type="number" hide allowDecimals={false} />
          <YAxis type="category" dataKey="label" width={128} {...eixoBase} axisLine={false} />
          <Tooltip content={dicaRecharts()} cursor={{ fill: 'rgba(32,38,26,0.04)' }} />
          <Bar dataKey="value" name="Reportes" fill={SEQUENCIAL[1]} radius={[0, 4, 4, 0]} maxBarSize={BARRA_MAX}>
            <LabelList dataKey="value" position="right" style={{ fontSize: 11, fill: EIXO }} />
          </Bar>
        </BarChart>
      </Cartao>

      <Cartao
        titulo="Discrepâncias de preço"
        subtitulo="Alertas informativos de preço fora do padrão da categoria."
        destaque={`${numero.format(discrepanciasTotal)} no total`}
        vazio={discrepanciasTotal === 0}
        legenda={[
          { nome: 'Na recepção (pendentes)', cor: CATEGORICA[0] },
          { nome: 'No catálogo', cor: CATEGORICA[1] },
        ]}
        tabela={{
          colunas: ['Motivo', 'Pendentes', 'Catálogo'],
          linhas: metricas.discrepancias.map((d) => [d.label, d.pendentes, d.catalogo]),
        }}
      >
        <BarChart
          data={metricas.discrepancias}
          layout="vertical"
          margin={{ top: 4, right: 40, left: 8, bottom: 4 }}
          barCategoryGap={10}
          barGap={2}
        >
          <XAxis type="number" hide allowDecimals={false} />
          <YAxis type="category" dataKey="label" width={128} {...eixoBase} axisLine={false} />
          <Tooltip content={dicaRecharts()} cursor={{ fill: 'rgba(32,38,26,0.04)' }} />
          <Bar dataKey="pendentes" name="Na recepção" fill={CATEGORICA[0]} radius={[0, 4, 4, 0]} maxBarSize={14} />
          <Bar dataKey="catalogo" name="No catálogo" fill={CATEGORICA[1]} radius={[0, 4, 4, 0]} maxBarSize={14} />
        </BarChart>
      </Cartao>
    </div>
  );
}
