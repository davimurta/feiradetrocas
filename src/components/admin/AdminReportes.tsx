'use client';

import { useState } from 'react';
import { Prohibit, CheckCircle, Coins } from '@phosphor-icons/react/dist/ssr';
import { bloquearContaAction, ajustarSaldoAction } from '@/app/actions/admin';
import { mensagemErro } from '@/lib/mensagens';
import { chamar } from '@/lib/acao';
import { formatarDataHora } from '@/lib/formato';
import { Alert, Badge, Button, EmptyCard, DataRow, DataCell, RowActions, ReadOnly } from '@/components/ui';
import type { ReporteView } from '@/server/queries';
import styles from './admin.module.css';

export function AdminReportes({ initial }: { initial: ReporteView[] }) {
  const [reportes, setReportes] = useState(initial);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);

  async function bloquear(rep: ReporteView, bloqueado: boolean) {
    setBusyId(rep.id);
    setMsg(null);
    const r = await chamar(bloquearContaAction({ id: rep.reportadoId, bloqueado }));
    setBusyId(null);
    if (r.ok) {
      setReportes((prev) => prev.map((x) => (x.reportadoId === rep.reportadoId ? { ...x, reportadoBloqueado: bloqueado } : x)));
      setMsg({ ok: true, texto: `${rep.reportadoNome} ${bloqueado ? 'bloqueado' : 'desbloqueado'}.` });
    } else {
      setMsg({ ok: false, texto: mensagemErro(r.error.code, r.error.message) });
    }
  }

  async function zerar(rep: ReporteView) {
    if (!window.confirm(`Zerar o saldo de ${rep.reportadoNome}?`)) return;
    setBusyId(rep.id);
    setMsg(null);
    const r = await chamar(ajustarSaldoAction({ id: rep.reportadoId, novoSaldo: 0 }));
    setBusyId(null);
    if (r.ok) {
      setReportes((prev) => prev.map((x) => (x.reportadoId === rep.reportadoId ? { ...x, reportadoSaldo: 0 } : x)));
      setMsg({ ok: true, texto: `Saldo de ${rep.reportadoNome} zerado.` });
    } else {
      setMsg({ ok: false, texto: mensagemErro(r.error.code, r.error.message) });
    }
  }

  return (
    <div className="stack">
      {msg && <Alert variant={msg.ok ? 'success' : 'error'}>{msg.texto}</Alert>}

      {reportes.length === 0 ? (
        <EmptyCard>Nenhum reporte.</EmptyCard>
      ) : (
        reportes.map((rep) => (
          <DataRow key={rep.id} testId="reporte-linha" className={styles.reporteRow}>
            <DataCell label="Matrícula">
              <ReadOnly>{rep.reportadoMatricula}</ReadOnly>
            </DataCell>
            <DataCell span={2} label="Denunciado">
              <ReadOnly wrap strong>
                {rep.reportadoNome} {rep.reportadoBloqueado && <Badge>bloqueado</Badge>}
              </ReadOnly>
            </DataCell>
            <DataCell label="Horário">
              <ReadOnly>{formatarDataHora(rep.createdAt)}</ReadOnly>
            </DataCell>
            <DataCell label="Motivo">
              <span className={styles.motivoPill}>{rep.motivo}</span>
            </DataCell>
            <DataCell label="Saldo">
              <ReadOnly>{rep.reportadoSaldo}</ReadOnly>
            </DataCell>
            <DataCell label="Reportado por">
              <ReadOnly>{rep.reportanteNome}</ReadOnly>
            </DataCell>
            {rep.descricao && (
              <DataCell span="full" label="Descrição">
                <ReadOnly wrap>{rep.descricao}</ReadOnly>
              </DataCell>
            )}
            <RowActions>
              <Button
                variant={rep.reportadoBloqueado ? 'ghost' : 'danger'}
                size="sm"
                onClick={() => bloquear(rep, !rep.reportadoBloqueado)}
                disabled={busyId === rep.id}
              >
                {rep.reportadoBloqueado ? (
                  <>
                    <CheckCircle size={16} weight="bold" /> Desbloquear
                  </>
                ) : (
                  <>
                    <Prohibit size={16} weight="bold" /> Bloquear conta
                  </>
                )}
              </Button>
              <Button variant="dangerOutline" size="sm" onClick={() => zerar(rep)} disabled={busyId === rep.id}>
                <Coins size={16} weight="bold" /> Zerar saldo
              </Button>
            </RowActions>
          </DataRow>
        ))
      )}
    </div>
  );
}
