'use client';

import { XCircle } from '@phosphor-icons/react/dist/ssr';
import { cx } from '@/lib/cx';
import { Button } from './Button';
import styles from './Modal.module.css';

export function Modal({
  title,
  onClose,
  ariaLabel,
  className,
  children,
}: {
  title?: React.ReactNode;
  onClose?: () => void;
  ariaLabel?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={styles.backdrop}
      role="dialog"
      aria-modal="true"
      aria-label={ariaLabel ?? (typeof title === 'string' ? title : undefined)}
    >
      <div className={cx(styles.modal, 'stack', className)}>
        {(title || onClose) && (
          <div className={styles.head}>
            {title && <h2>{title}</h2>}
            {onClose && (
              <Button variant="ghost" size="sm" onClick={onClose} aria-label="Fechar">
                <XCircle size={20} weight="bold" />
              </Button>
            )}
          </div>
        )}
        {children}
      </div>
    </div>
  );
}
