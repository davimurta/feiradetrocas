import { cx } from '@/lib/cx';
import styles from './Button.module.css';

type Variant = 'primary' | 'ghost' | 'danger' | 'dangerOutline';
type Size = 'md' | 'sm' | 'lg';

export function Button({
  variant = 'primary',
  size = 'md',
  block = false,
  type = 'button',
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  block?: boolean;
}) {
  return (
    <button
      type={type}
      className={cx(styles.btn, styles[variant], size !== 'md' && styles[size], block && styles.block, className)}
      {...props}
    />
  );
}
