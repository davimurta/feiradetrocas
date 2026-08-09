import { cx } from '@/lib/cx';
import styles from './Field.module.css';

export function Field({
  label,
  htmlFor,
  error,
  hint,
  className,
  children,
}: {
  label?: React.ReactNode;
  htmlFor?: string;
  error?: string | null;
  hint?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cx(styles.field, className)}>
      {label != null && <label htmlFor={htmlFor}>{label}</label>}
      {children}
      {error ? (
        <span className={styles.error}>{error}</span>
      ) : hint ? (
        <span className={styles.hint}>{hint}</span>
      ) : null}
    </div>
  );
}
