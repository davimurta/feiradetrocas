'use client';

import { cx } from '@/lib/cx';
import { Pill } from './Pill';
import styles from './Tabs.module.css';

export type TabItem<T extends string> = { value: T; label: React.ReactNode; badge?: number };

export function Tabs<T extends string>({
  items,
  value,
  onChange,
  ariaLabel,
  className,
}: {
  items: TabItem<T>[];
  value: T;
  onChange: (value: T) => void;
  ariaLabel?: string;
  className?: string;
}) {
  return (
    <div className={cx(styles.tabs, className)} role="tablist" aria-label={ariaLabel}>
      {items.map((it) => (
        <button
          key={it.value}
          type="button"
          className={styles.tab}
          role="tab"
          aria-selected={value === it.value}
          onClick={() => onChange(it.value)}
        >
          {it.label}
          {it.badge != null && it.badge > 0 && <Pill>{it.badge}</Pill>}
        </button>
      ))}
    </div>
  );
}
