'use client';

import { useState } from 'react';
import { Unidade } from '@prisma/client';
import type { AdminDashboard, TransacaoRecente, ItemAdmin, UsuarioAdmin } from '@/server/queries';
import { dashboardAction } from '@/app/actions/admin';
import { AdminCharts } from './AdminCharts';
import { AdminItens } from './AdminItens';
import { AdminUsuarios } from './AdminUsuarios';

const UNIDADES = Object.values(Unidade);
type Aba = 'metricas' | 'usuarios' | 'itens';

const ROTULO: Record<string, string> = {
  credito_entrada: 'Item entregue',
  debito_compra: 'Compra',
  ajuste_manual: 'Ajuste manual',
};

function formatarData(d: Date): string {
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(
    new Date(d),
  );
}

function sinal(tipo: string, valor: number) {
  const debito = tipo === 'debito_compra' || (tipo === 'ajuste_manual' && valor < 0);
  return { debito, magnitude: Math.abs(valor) };
}

export function AdminConsole({
  dashboard,
  recentes,
  itens,
  usuarios,
}: {
  dashboard: AdminDashboard;
  recentes: TransacaoRecente[];
  itens: ItemAdmin[];
  usuarios: UsuarioAdmin[];
}) {
  const [aba, setAba] = useState<Aba>('metricas');
  const [unidade, setUnidade] = useState<Unidade | ''>(''); // '' = ambas
  const [dash, setDash] = useState(dashboard);
  const [rec, setRec] = useState(recentes);
  const [carregando, setCarregando] = useState(false);

  const unidadeFiltro = unidade || undefined;

  async function trocarUnidade(u: Unidade | '') {
    setUnidade(u);
    setCarregando(true);
    const r = await dashboardAction({ unidade: u || undefined });
    setCarregando(false);
    if (r.ok) {
      setDash(r.data.dashboard);
      setRec(r.data.recentes);
    }
  }

  return (
    <main className="screen stack">
      <div className="row-between">
        <h1 className="page-title">Painel do admin</h1>
        <div className="field" style={{ maxWidth: 240 }}>
          <label htmlFor="filtro-unidade">Exibir unidade</label>
          <select
            id="filtro-unidade"
            className="select"
            value={unidade}
            onChange={(e) => trocarUnidade(e.target.value as Unidade | '')}
          >
            <option value="">Ambas as unidades</option>
            {UNIDADES.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="admin-tabs" role="tablist">
        <button className="admin-tab" role="tab" aria-selected={aba === 'metricas'} onClick={() => setAba('metricas')}>
          Métricas
        </button>
        <button className="admin-tab" role="tab" aria-selected={aba === 'usuarios'} onClick={() => setAba('usuarios')}>
          Usuários
        </button>
        <button className="admin-tab" role="tab" aria-selected={aba === 'itens'} onClick={() => setAba('itens')}>
          Itens
        </button>
      </div>

      {aba === 'metricas' && (
        <div className="stack" style={{ opacity: carregando ? 0.6 : 1 }}>
          <section className="metrics">
            <Metric n={dash.fichasEmCirculacao} k="Fichas em circulação" />
            <Metric n={dash.itensEmEstoque} k="Itens em estoque" />
            <Metric n={dash.produtosDistintos} k="Produtos distintos" />
            <Metric n={dash.totalTransacoes} k="Transações" />
            <Metric n={dash.totalUsuarios} k="Usuários" />
            <Metric n={dash.totalAlunos} k="Alunos" />
          </section>

          <AdminCharts dash={dash} />

          <section className="stack">
            <h2>Transações recentes</h2>
            {rec.length === 0 ? (
              <div className="card center muted">Nenhuma transação ainda.</div>
            ) : (
              <div className="rows">
                {rec.map((t) => {
                  const { debito, magnitude } = sinal(t.tipo, t.valor);
                  return (
                    <div key={t.id} className="line">
                      <div className="stack-sm" style={{ gap: 2 }}>
                        <strong>{t.itemNome ?? ROTULO[t.tipo] ?? t.tipo}</strong>
                        <span className="muted" style={{ fontSize: '0.82rem' }}>
                          {ROTULO[t.tipo] ?? t.tipo} · {t.usuarioNome} · {formatarData(t.createdAt)}
                        </span>
                      </div>
                      <span className={`amount ${debito ? 'amount--debit' : 'amount--credit'}`}>
                        {debito ? '−' : '+'}
                        {magnitude}
                        <span className="un"> Fichas</span>
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      )}

      {aba === 'usuarios' && <AdminUsuarios initial={usuarios} unidade={unidadeFiltro} />}
      {aba === 'itens' && <AdminItens initial={itens} unidade={unidadeFiltro} />}
    </main>
  );
}

function Metric({ n, k }: { n: number; k: string }) {
  return (
    <div className="metric">
      <div className="n">{n}</div>
      <div className="k">{k}</div>
    </div>
  );
}
