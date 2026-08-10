'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { DownloadSimple, ArrowClockwise } from '@phosphor-icons/react';
import type { Unidade } from '@prisma/client';
import type { MetricasView } from '@/server/metricas';
import type { TransacaoRecente } from '@/server/queries';
import { metricasAction } from '@/app/actions/admin';
import { PERIODOS, type Periodo } from '@/lib/filtroMetricas';
import { chamar } from '@/lib/acao';
import { cx } from '@/lib/cx';
import { Alert, Button, SelectField, TextInput } from '@/components/ui';
import { TransacaoList } from '@/components/TransacaoList';
import { AdminCharts } from './AdminCharts';
import { numero, duracao } from './paleta';
import styles from './metricas.module.css';
import botao from '@/components/ui/Button.module.css';

const ROTULO_PERIODO: Record<Periodo, string> = {
  hoje: 'Hoje',
  '24h': 'Últimas 24 horas',
  '7d': 'Últimos 7 dias',
  '30d': 'Últimos 30 dias',
  tudo: 'Todo o evento',
  custom: 'Intervalo personalizado',
};

interface Filtros {
  periodo: Periodo;
  de: string;
  ate: string;
  granularidade: '' | 'hora' | 'dia';
}

const INICIAL: Filtros = { periodo: '7d', de: '', ate: '', granularidade: '' };

const DATASETS_CSV: [string, string][] = [
  ['transacoes', 'Transações'],
  ['saldos', 'Saldos por participante'],
  ['itens', 'Itens (catálogo + recepção)'],
  ['status', 'Status dos pedidos'],
  ['resumo', 'Resumo agregado'],
];

function paramsDe(f: Filtros, unidade?: Unidade): URLSearchParams {
  const p = new URLSearchParams({ periodo: f.periodo });
  if (f.periodo === 'custom') {
    if (f.de) p.set('de', f.de);
    if (f.ate) p.set('ate', f.ate);
  }
  if (f.granularidade) p.set('granularidade', f.granularidade);
  if (unidade) p.set('unidade', unidade);
  return p;
}

export function AdminMetricas({
  inicial,
  recentes: recentesIniciais,
  unidade,
}: {
  inicial: MetricasView;
  recentes: TransacaoRecente[];
  unidade?: Unidade;
}) {
  const [filtros, setFiltros] = useState<Filtros>(INICIAL);
  const [metricas, setMetricas] = useState(inicial);
  const [recentes, setRecentes] = useState(recentesIniciais);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const primeiraRenderizacao = useRef(true);

  const recarregar = useCallback(async () => {
    setCarregando(true);
    setErro(null);
    const r = await chamar(
      metricasAction({
        periodo: filtros.periodo,
        de: filtros.periodo === 'custom' ? filtros.de || undefined : undefined,
        ate: filtros.periodo === 'custom' ? filtros.ate || undefined : undefined,
        granularidade: filtros.granularidade || undefined,
        unidade,
      }),
    );
    setCarregando(false);
    if (r.ok) {
      setMetricas(r.data.metricas);
      setRecentes(r.data.recentes);
    } else {
      setErro(r.error.message);
    }
  }, [filtros, unidade]);

  useEffect(() => {
    if (primeiraRenderizacao.current) {
      primeiraRenderizacao.current = false;
      return;
    }
    void recarregar();
  }, [recarregar]);

  function urlExport(formato: 'xlsx' | 'csv', dataset: string) {
    const p = paramsDe(filtros, unidade);
    p.set('formato', formato);
    p.set('dataset', dataset);
    return `/admin/export?${p}`;
  }

  const { kpis, fichas, fila } = metricas;
  const inicio = new Date(metricas.filtro.de);
  const fim = new Date(metricas.filtro.ate);
  const periodoLegivel = `${inicio.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })} até ${fim.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}`;

  return (
    <div className="stack">
      <div className={styles.filtros}>
        <SelectField
          containerClassName={styles.campoCurto}
          label="Período"
          value={filtros.periodo}
          onChange={(e) => setFiltros((f) => ({ ...f, periodo: e.target.value as Periodo }))}
        >
          {PERIODOS.map((p) => (
            <option key={p} value={p}>
              {ROTULO_PERIODO[p]}
            </option>
          ))}
        </SelectField>

        {filtros.periodo === 'custom' && (
          <>
            <TextInput
              containerClassName={styles.campoData}
              label="De"
              type="datetime-local"
              value={filtros.de}
              onChange={(e) => setFiltros((f) => ({ ...f, de: e.target.value }))}
            />
            <TextInput
              containerClassName={styles.campoData}
              label="Até"
              type="datetime-local"
              value={filtros.ate}
              onChange={(e) => setFiltros((f) => ({ ...f, ate: e.target.value }))}
            />
          </>
        )}

        <SelectField
          containerClassName={styles.campoCurto}
          label="Granularidade"
          value={filtros.granularidade}
          onChange={(e) =>
            setFiltros((f) => ({ ...f, granularidade: e.target.value as Filtros['granularidade'] }))
          }
        >
          <option value="">Automática</option>
          <option value="hora">Por hora</option>
          <option value="dia">Por dia</option>
        </SelectField>

        <div className={styles.acoes}>
          <Button variant="ghost" size="sm" onClick={() => void recarregar()} disabled={carregando}>
            <ArrowClockwise size={16} weight="bold" />
            Atualizar
          </Button>
          <a
            className={cx(botao.btn, botao.primary, botao.sm)}
            href={urlExport('xlsx', 'tudo')}
            download
          >
            <DownloadSimple size={16} weight="bold" />
            Exportar planilha
          </a>
        </div>
      </div>

      <details className={styles.menuCsv}>
        <summary>Exportar um dataset em CSV</summary>
        <div className={styles.linksCsv}>
          {DATASETS_CSV.map(([chave, rotulo]) => (
            <a key={chave} href={urlExport('csv', chave)} download>
              {rotulo}
            </a>
          ))}
        </div>
      </details>

      {erro && <Alert>{erro}</Alert>}

      <p className={styles.kpiNota}>
        {periodoLegivel} · {metricas.filtro.unidade ?? 'ambas as unidades'} · granularidade{' '}
        {metricas.filtro.granularidade}
      </p>

      <div className={cx(carregando && styles.dim)}>
        <section className={styles.kpis}>
          <Kpi valor={kpis.transacoes} rotulo="Transações no período" />
          <Kpi valor={fichas.emitidas} rotulo="Fichas emitidas" nota="créditos de entrada" />
          <Kpi valor={fichas.gastas} rotulo="Fichas gastas" nota="compras aprovadas" />
          <Kpi
            valor={fichas.emCirculacao}
            rotulo="Fichas em circulação"
            nota="saldo somado agora"
          />
          <Kpi
            valor={kpis.itensEmEstoque}
            rotulo="Itens em estoque"
            nota={`${numero.format(kpis.valorEstoque)} fichas em catálogo`}
          />
          <Kpi
            valor={kpis.produtosDistintos}
            rotulo="Produtos distintos"
            nota={`${numero.format(kpis.itensEsgotados)} esgotados`}
          />
          <Kpi valor={kpis.alunos} rotulo="Alunos" nota={`${numero.format(kpis.usuarios)} contas`} />
          <Kpi
            valor={fila.pendentes}
            rotulo="Fila da recepção"
            nota={`push em ${duracao(fila.segundosMedioAtePush)}`}
          />
          <Kpi
            valor={metricas.pedidos.total}
            rotulo="Pedidos no período"
            nota={`${(metricas.pedidos.taxaRecusa * 100).toFixed(1)}% de recusa`}
          />
          <Kpi
            valor={kpis.alunosBloqueados}
            rotulo="Contas bloqueadas"
            nota={`${numero.format(kpis.contasPendentes)} pendentes`}
          />
        </section>
      </div>

      <div className={cx(carregando && styles.dim)}>
        <AdminCharts metricas={metricas} />
      </div>

      <section className="stack">
        <h2>Transações recentes</h2>
        <TransacaoList itens={recentes} vazio="Nenhuma transação ainda." />
      </section>
    </div>
  );
}

function Kpi({ valor, rotulo, nota }: { valor: number; rotulo: string; nota?: string }) {
  return (
    <div className={styles.kpi}>
      <div className={styles.kpiValor}>{numero.format(valor)}</div>
      <div className={styles.kpiRotulo}>{rotulo}</div>
      {nota && <div className={styles.kpiNota}>{nota}</div>}
    </div>
  );
}
