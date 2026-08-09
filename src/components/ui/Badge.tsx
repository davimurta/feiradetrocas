import { cx } from '@/lib/cx';
import styles from './Badge.module.css';

export function Badge({ variant = 'danger', children }: { variant?: 'danger' | 'warn'; children: React.ReactNode }) {
  return <span className={cx(styles.badge, styles[variant])}>{children}</span>;
}
