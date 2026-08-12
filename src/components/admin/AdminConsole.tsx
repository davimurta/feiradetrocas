'use client';

import { useState } from 'react';
import { Unidade } from '@prisma/client';
import type { TransacaoRecente, ItemAdmin, UsuarioAdmin, ReporteView, AlertaDiscrepanciaView } from '@/server/queries';
import type { MetricasView } from '@/server/metricas';
import { alertasCatalogoAction } from '@/app/actions/admin';
import { chamar } from '@/lib/acao';
import { Tabs, SelectField } from '@/components/ui';

import { AlertasDiscrepancia } from '@/components/alertas/AlertasDiscrepancia';
import { AdminMetricas } from './AdminMetricas';
import { AdminItens } from './AdminItens';
import { AdminUsuarios } from './AdminUsuarios';
import { AdminReportes } from './AdminReportes';
import { AdminAcoesCriticas } from './AdminAcoesCriticas';
import { AdminAcessos } from './AdminAcessos';
import { AdminConvites } from './AdminConvites';
import styles from './admin.module.css';

const UNIDADES = Object.values(Unidade);
type Aba = 'metricas' | 'usuarios' | 'itens' | 'reportes' | 'convites' | 'acessos' | 'criticas';

export function AdminConsole({
  metricas,
  recentes,
  itens,
  usuarios,
  reportes,
  alertas: alertasIniciais,
}: {
  metricas: MetricasView;
  recentes: TransacaoRecente[];
  itens: ItemAdmin[];
  usuarios: UsuarioAdmin[];
  reportes: ReporteView[];
  alertas: AlertaDiscrepanciaView[];
}) {
  const [aba, setAba] = useState<Aba>('metricas');
  const [unidade, setUnidade] = useState<Unidade | ''>('');
  const [alertas, setAlertas] = useState(alertasIniciais);
  const [foco, setFoco] = useState<string | null>(null);

  const unidadeFiltro = unidade || undefined;
  const alertasVisiveis = unidade === '' ? alertas : alertas.filter((a) => a.unidade === unidade);

  async function recarregarAlertas() {
    const r = await chamar(alertasCatalogoAction());
    if (r.ok) setAlertas(r.data);
  }

  function irParaItem(itemId: string) {
    setAba('itens');
    setFoco(itemId);
    setTimeout(() => setFoco((atual) => (atual === itemId ? null : atual)), 2600);
  }

  return (
    <main className="screen stack">
      <AlertasDiscrepancia alertas={alertasVisiveis} onEditar={irParaItem} />

      <div className="row-between">
        <h1 className="page-title">Painel do admin</h1>
        <SelectField
          containerClassName={styles.filtro}
          label="Exibir unidade"
          value={unidade}
          onChange={(e) => setUnidade(e.target.value as Unidade | '')}
        >
          <option value="">Ambas as unidades</option>
          {UNIDADES.map((u) => (
            <option key={u} value={u}>
              {u}
            </option>
          ))}
        </SelectField>
      </div>

      <Tabs
        value={aba}
        onChange={setAba}
        items={[
          { value: 'metricas', label: 'Métricas' },
          { value: 'usuarios', label: 'Usuários' },
          { value: 'itens', label: 'Itens' },
          { value: 'reportes', label: 'Reportes', badge: reportes.length },
          { value: 'convites', label: 'Convites' },
          { value: 'acessos', label: 'Acessos' },
          { value: 'criticas', label: 'Ações críticas' },
        ]}
      />

      {aba === 'metricas' && (
        <AdminMetricas inicial={metricas} recentes={recentes} unidade={unidadeFiltro} />
      )}

      {aba === 'usuarios' && <AdminUsuarios initial={usuarios} unidade={unidadeFiltro} />}
      {aba === 'itens' && <AdminItens initial={itens} unidade={unidadeFiltro} foco={foco} onMutou={recarregarAlertas} />}
      {aba === 'reportes' && <AdminReportes initial={reportes} />}
      {aba === 'convites' && <AdminConvites />}
      {aba === 'acessos' && <AdminAcessos />}
      {aba === 'criticas' && <AdminAcoesCriticas />}
    </main>
  );
}
