import { cx } from '@/lib/cx';
import styles from './Pill.module.css';

export function Pill({ className, children }: { className?: string; children: React.ReactNode }) {
  return <span className={cx(styles.pill, className)}>{children}</span>;
}
