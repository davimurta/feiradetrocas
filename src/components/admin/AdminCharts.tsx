'use client';

import { useEffect, useState } from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Cell,
  LabelList,
} from 'recharts';
import type { AdminDashboard } from '@/server/queries';

const GREEN = '#4aa521';
const RED = '#b4291a';
const GRID = '#c7e2a6';
const INK = '#15140f';

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="card stack-sm">
      <span className="card-title">{title}</span>
      <div style={{ width: '100%', height: 220 }}>{children}</div>
    </div>
  );
}

/** Gráficos do admin com Recharts. Renderiza só após montar (evita SSR de tamanho 0). */
export function AdminCharts({ dash }: { dash: AdminDashboard }) {
  const [montado, setMontado] = useState(false);
  useEffect(() => setMontado(true), []);

  const volume = [
    { label: 'Créditos', value: dash.volumeCreditos, cor: GREEN },
    { label: 'Débitos', value: dash.volumeDebitos, cor: RED },
  ];

  const grid = {
    display: 'grid',
    gap: '16px',
    gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
  } as const;

  if (!montado) {
    return (
      <div style={grid}>
        {['Transações (últimos 7 dias)', 'Itens em estoque por categoria', 'Estoque por unidade', 'Volume de fichas'].map(
          (t) => (
            <ChartCard key={t} title={t}>
              <div className="center muted" style={{ paddingTop: 80 }}>
                carregando…
              </div>
            </ChartCard>
          ),
        )}
      </div>
    );
  }

  return (
    <div style={grid}>
      <ChartCard title="Transações (últimos 7 dias)">
        <ResponsiveContainer>
          <BarChart data={dash.transacoesPorDia} margin={{ top: 16, right: 8, left: -6, bottom: 0 }}>
            <XAxis dataKey="label" tick={{ fontSize: 12 }} tickLine={false} axisLine={{ stroke: GRID }} />
            <YAxis allowDecimals={false} tick={{ fontSize: 12 }} tickLine={false} axisLine={false} width={34} />
            <Tooltip cursor={{ fill: 'rgba(0,0,0,0.05)' }} />
            <Bar dataKey="value" name="Transações" fill={GREEN} radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="Itens em estoque por categoria">
        <ResponsiveContainer>
          <BarChart data={dash.itensPorCategoria} layout="vertical" margin={{ top: 4, right: 28, left: 8, bottom: 4 }}>
            <XAxis type="number" allowDecimals={false} hide />
            <YAxis type="category" dataKey="label" width={92} tick={{ fontSize: 12 }} tickLine={false} axisLine={false} />
            <Tooltip cursor={{ fill: 'rgba(0,0,0,0.05)' }} />
            <Bar dataKey="value" name="Estoque" fill={GREEN} radius={[0, 4, 4, 0]}>
              <LabelList dataKey="value" position="right" style={{ fontSize: 12, fill: INK }} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="Estoque por unidade">
        <ResponsiveContainer>
          <BarChart data={dash.estoquePorUnidade} layout="vertical" margin={{ top: 4, right: 28, left: 8, bottom: 4 }}>
            <XAxis type="number" allowDecimals={false} hide />
            <YAxis type="category" dataKey="label" width={80} tick={{ fontSize: 12 }} tickLine={false} axisLine={false} />
            <Tooltip cursor={{ fill: 'rgba(0,0,0,0.05)' }} />
            <Bar dataKey="value" name="Estoque" fill={GREEN} radius={[0, 4, 4, 0]}>
              <LabelList dataKey="value" position="right" style={{ fontSize: 12, fill: INK }} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="Volume de fichas">
        <ResponsiveContainer>
          <BarChart data={volume} layout="vertical" margin={{ top: 4, right: 28, left: 8, bottom: 4 }}>
            <XAxis type="number" allowDecimals={false} hide />
            <YAxis type="category" dataKey="label" width={80} tick={{ fontSize: 12 }} tickLine={false} axisLine={false} />
            <Tooltip cursor={{ fill: 'rgba(0,0,0,0.05)' }} />
            <Bar dataKey="value" name="Fichas" radius={[0, 4, 4, 0]}>
              {volume.map((v) => (
                <Cell key={v.label} fill={v.cor} />
              ))}
              <LabelList dataKey="value" position="right" style={{ fontSize: 12, fill: INK }} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>
    </div>
  );
}
