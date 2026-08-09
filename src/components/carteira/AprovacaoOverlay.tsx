'use client';

import { Check, X } from '@phosphor-icons/react/dist/ssr';
import { cx } from '@/lib/cx';
import { Pill } from '@/components/ui';
import type { PedidoPendenteView } from '@/server/queries';
import styles from './AprovacaoOverlay.module.css';

export function AprovacaoOverlay({
  pedido,
  fila,
  onAceitar,
  onRecusar,
  busy,
}: {
  pedido: PedidoPendenteView;
  fila: number;
  onAceitar: () => void;
  onRecusar: () => void;
  busy: boolean;
}) {
  return (
    <div className={styles.overlay} role="dialog" aria-modal="true" aria-label="Aprovar compra">
      <button className={cx(styles.btn, styles.aceitar)} onClick={onAceitar} disabled={busy}>
        <Check size={64} weight="bold" />
        <span>Aceitar</span>
      </button>

      <div className={styles.info}>
        <span className={styles.item}>{pedido.itemNome}</span>
        <span className={styles.valor}>−{pedido.valor} fichas</span>
        <span className="muted">
          Stand: {pedido.atendenteNome} · unidade {pedido.unidade}
        </span>
        {pedido.descricao && <p className={styles.desc}>{pedido.descricao}</p>}
        {fila > 1 && <Pill>+{fila - 1} na fila</Pill>}
      </div>

      <button className={cx(styles.btn, styles.recusar)} onClick={onRecusar} disabled={busy}>
        <X size={64} weight="bold" />
        <span>Recusar</span>
      </button>
    </div>
  );
}
