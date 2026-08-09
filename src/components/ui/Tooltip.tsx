'use client';

import { Info } from '@phosphor-icons/react/dist/ssr';
import { cx } from '@/lib/cx';
import styles from './Tooltip.module.css';

export function Tooltip({
  items,
  label = 'Ver informações do registro',
  placement = 'up',
  align = 'left',
  className,
}: {
  items: { label: string; value: React.ReactNode }[];
  label?: string;
  placement?: 'up' | 'down';
  align?: 'left' | 'right';
  className?: string;
}) {
  return (
    <span className={cx(styles.wrap, className)}>
      <button type="button" className={styles.trigger} aria-label={label}>
        <Info size={17} weight="bold" />
      </button>
      <span
        className={cx(styles.bubble, placement === 'down' && styles.down, align === 'right' && styles.right)}
        role="tooltip"
      >
        {items.map((it) => (
          <span key={it.label} className={styles.item}>
            <span className={styles.itemLabel}>{it.label}</span>
            <span className={styles.itemValue}>{it.value}</span>
          </span>
        ))}
      </span>
    </span>
  );
}
