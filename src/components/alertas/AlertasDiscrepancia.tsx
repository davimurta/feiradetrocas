'use client';

import { WarningCircle, PencilSimple } from '@phosphor-icons/react/dist/ssr';
import { Badge, Button } from '@/components/ui';
import type { AlertaDiscrepanciaView } from '@/server/queries';
import type { MotivoAlerta } from '@/lib/alertas/discrepancia';
import styles from './AlertasDiscrepancia.module.css';

const LABEL: Record<MotivoAlerta, string> = {
  preco_zero: 'Preço zero',
  preco_discrepante: 'Preço destoante',
};

const VARIANTE: Record<MotivoAlerta, 'danger' | 'warn'> = {
  preco_zero: 'danger',
  preco_discrepante: 'warn',
};

export function AlertasDiscrepancia({
  alertas,
  onEditar,
}: {
  alertas: AlertaDiscrepanciaView[];
  onEditar: (itemId: string) => void;
}) {
  if (alertas.length === 0) return null;
  const n = alertas.length;

  return (
    <section className={styles.box} role="status" aria-label="Alertas de preço" data-testid="alertas-discrepancia">
      <header className={styles.head}>
        <WarningCircle size={20} weight="fill" className={styles.icone} />
        <strong>
          {n} {n === 1 ? 'item precisa' : 'itens precisam'} de revisão de preço
        </strong>
        <span className={styles.nota}>Apenas um aviso — não impede a produção.</span>
      </header>
      <ul className={styles.lista}>
        {alertas.map((a) => (
          <li key={a.itemId} className={styles.item}>
            <div className={styles.info}>
              <span className={styles.nome}>{a.nome}</span>
              <span className={styles.meta}>
                {a.categoria} · {a.unidade}
                {a.aluno ? ` · ${a.aluno}` : ''}
              </span>
            </div>
            <div className={styles.motivos}>
              {a.motivos.map((m) => (
                <Badge key={m} variant={VARIANTE[m]}>
                  {LABEL[m]}
                </Badge>
              ))}
            </div>
            <span className={styles.valor}>
              {a.valor} <small>fichas</small>
            </span>
            <Button variant="ghost" size="sm" onClick={() => onEditar(a.itemId)}>
              <PencilSimple size={15} weight="bold" /> Editar
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}
