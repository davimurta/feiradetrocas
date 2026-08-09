'use client';

import { MagnifyingGlass } from '@phosphor-icons/react/dist/ssr';
import { cx } from '@/lib/cx';
import styles from './SearchField.module.css';

export function SearchField({
  value,
  onValueChange,
  placeholder,
  ariaLabel,
  className,
  disabled,
}: {
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  ariaLabel?: string;
  className?: string;
  disabled?: boolean;
}) {
  return (
    <div className={cx(styles.search, className)}>
      <input
        className={styles.input}
        value={value}
        onChange={(e) => onValueChange(e.target.value)}
        placeholder={placeholder}
        aria-label={ariaLabel ?? placeholder}
        disabled={disabled}
      />
      <span className={styles.ico} aria-hidden>
        <MagnifyingGlass size={18} />
      </span>
    </div>
  );
}
