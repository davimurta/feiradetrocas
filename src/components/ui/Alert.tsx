import { cx } from '@/lib/cx';
import styles from './Alert.module.css';

export function Alert({
  variant = 'error',
  role,
  className,
  children,
}: {
  variant?: 'error' | 'success';
  role?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cx(styles.alert, styles[variant], className)} role={role ?? (variant === 'error' ? 'alert' : 'status')}>
      {children}
    </div>
  );
}
