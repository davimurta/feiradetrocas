'use client';

import { useState } from 'react';
import {
  Package,
  QrCode,
  CheckCircle,
  ClockCounterClockwise,
  ArrowLeft,
  ArrowRight,
} from '@phosphor-icons/react/dist/ssr';
import { cx } from '@/lib/cx';
import { Button, Modal } from '@/components/ui';
import styles from './TutorialModal.module.css';

const PASSOS = [
  {
    icon: Package,
    titulo: 'Entregue itens na recepção',
    texto: 'Leve seus itens à recepção da feira. Cada item recebido vira fichas creditadas na sua carteira.',
  },
  {
    icon: QrCode,
    titulo: 'Mostre seu QR no stand',
    texto: 'No stand, toque em "Exibir QRcode" e mostre o código ao atendente para comprar um item.',
  },
  {
    icon: CheckCircle,
    titulo: 'Aprove a compra',
    texto: 'A compra aparece na sua carteira em tela cheia. Toque em Aceitar para confirmar — as fichas são debitadas na hora.',
  },
  {
    icon: ClockCounterClockwise,
    titulo: 'Acompanhe no histórico',
    texto: 'Todos os créditos e débitos ficam registrados no histórico da carteira, com data e valor.',
  },
];

export function TutorialModal({ onFechar }: { onFechar: () => void }) {
  const [i, setI] = useState(0);
  const passo = PASSOS[i];
  const Icone = passo.icon;
  const primeiro = i === 0;
  const ultimo = i === PASSOS.length - 1;

  return (
    <Modal ariaLabel="Como usar a Feira de Trocas" onClose={onFechar}>
      <div className={styles.tutorial}>
        <div className={styles.iconWrap}>
          <Icone size={34} weight="duotone" />
        </div>
        <div className={styles.passoNum}>
          Passo {i + 1} de {PASSOS.length}
        </div>
        <div className={styles.titulo}>{passo.titulo}</div>
        <p className={styles.texto}>{passo.texto}</p>

        <div className={styles.dots} aria-hidden>
          {PASSOS.map((_, idx) => (
            <span key={idx} className={cx(styles.dot, idx === i && styles.dotAtivo)} />
          ))}
        </div>

        <div className={styles.nav}>
          <Button variant="ghost" onClick={() => (primeiro ? onFechar() : setI(i - 1))}>
            {primeiro ? (
              'Fechar'
            ) : (
              <>
                <ArrowLeft size={16} weight="bold" /> Anterior
              </>
            )}
          </Button>
          <Button variant="primary" onClick={() => (ultimo ? onFechar() : setI(i + 1))}>
            {ultimo ? (
              'Concluir'
            ) : (
              <>
                Próximo <ArrowRight size={16} weight="bold" />
              </>
            )}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
