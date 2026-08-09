'use client';

import { useState } from 'react';
import { QrCode, Question } from '@phosphor-icons/react/dist/ssr';
import { cx } from '@/lib/cx';
import { Button, Modal } from '@/components/ui';
import { QRCode } from '@/components/QRCode';
import { TutorialModal } from './TutorialModal';
import styles from './CarteiraAcoes.module.css';

export function CarteiraAcoes({ saldo, codigoCarteira }: { saldo: number; codigoCarteira: string }) {
  const [qr, setQr] = useState(false);
  const [tut, setTut] = useState(false);

  return (
    <div className="stack">
      <div className={cx(styles.saldoCard, 'stack-sm')}>
        <span className={styles.rot}>Saldo da carteira</span>
        <div className={styles.valorLinha}>
          <span className={styles.valor} data-testid="saldo-valor">
            {saldo}
          </span>
          <span className={styles.un}>Fichas</span>
        </div>
      </div>

      <div className={styles.acoes}>
        <button type="button" className={styles.sideBtn} onClick={() => setQr(true)}>
          <QrCode size={34} weight="regular" />
          <span>Exibir QRcode</span>
        </button>
        <button type="button" className={styles.sideBtn} onClick={() => setTut((v) => !v)} aria-pressed={tut}>
          <Question size={34} weight="regular" />
          <span>Fazer tutorial</span>
        </button>
      </div>

      {tut && <TutorialModal onFechar={() => setTut(false)} />}

      {qr && (
        <Modal ariaLabel="Sua carteira">
          <div className={styles.qrModal}>
            <div className={styles.qrHead}>
              <div className={styles.qrTitle}>Sua carteira</div>
              <div className={styles.qrSub}>Mostre este código ao atendente do stand</div>
            </div>
            <div className={styles.qrFrame}>
              <QRCode value={codigoCarteira} size={216} />
            </div>
            <span className={styles.qrLabel}>{codigoCarteira}</span>
            <div className={styles.qrSaldo}>
              <span className="muted" style={{ fontSize: '0.82rem' }}>
                Saldo atual
              </span>
              <span className={styles.qrSaldoValor}>{saldo}</span>
              <span className="muted" style={{ fontSize: '0.82rem' }}>
                Fichas
              </span>
            </div>
            <Button variant="primary" block onClick={() => setQr(false)}>
              Fechar
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}
