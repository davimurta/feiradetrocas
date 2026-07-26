'use client';

import { useState } from 'react';
import { QrCode, Question } from '@phosphor-icons/react/dist/ssr';
import { QRCode } from './QRCode';

export function CarteiraAcoes({ saldo, codigoCarteira }: { saldo: number; codigoCarteira: string }) {
  const [qr, setQr] = useState(false);
  const [tut, setTut] = useState(false);

  return (
    <div className="stack">
      <div className="saldo-card stack-sm">
        <span className="rot">Saldo da carteira</span>
        <div>
          <span className="valor">{saldo}</span>
          <span className="un"> Fichas</span>
        </div>
      </div>

      <div className="row">
        <button type="button" className="side-btn grow" onClick={() => setQr((v) => !v)} aria-pressed={qr}>
          <QrCode size={40} weight="regular" />
          Exibir QRcode
        </button>
        <button type="button" className="side-btn grow" onClick={() => setTut((v) => !v)} aria-pressed={tut}>
          <Question size={40} weight="regular" />
          Fazer tutorial
        </button>
      </div>

      {qr && (
        <div className="card qr-wrap">
          <span className="rot" style={{ fontSize: '1rem' }}>
            Sua carteira
          </span>
          <div className="qr-frame">
            <QRCode value={codigoCarteira} size={220} />
          </div>
          <span className="qr-code-label">{codigoCarteira}</span>
          <p className="muted center">Mostre este QR no stand para comprar.</p>
        </div>
      )}

      {tut && (
        <div className="card" style={{ fontSize: '0.9rem' }}>
          <b>Como usar suas fichas:</b>
          <ol style={{ margin: '8px 0 0 18px', padding: 0 }}>
            <li>Entregue itens na recepção para ganhar fichas.</li>
            <li>No stand, mostre este QR para o atendente.</li>
            <li>O valor é debitado na hora e aparece no histórico.</li>
          </ol>
        </div>
      )}
    </div>
  );
}
