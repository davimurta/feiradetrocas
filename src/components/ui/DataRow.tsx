'use client';

import { cx } from '@/lib/cx';
import { sanitizeText, LIMITE_TEXTO, LIMITE_TEXTO_LONGO } from '@/lib/sanitize';
import styles from './DataRow.module.css';

const TIPOS_TEXTO = ['text', 'email', 'search', 'tel', 'url'];

export function DataRow({ testId, className, children }: { testId?: string; className?: string; children: React.ReactNode }) {
  return (
    <div className={cx(styles.row, className)} data-testid={testId}>
      {children}
    </div>
  );
}

export function DataCell({
  label,
  span,
  className,
  children,
}: {
  label?: React.ReactNode;
  span?: 2 | 'full';
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <label className={cx(styles.cell, span === 2 && styles.span2, span === 'full' && styles.full, className)}>
      {label != null && <span className={styles.caption}>{label}</span>}
      {children}
    </label>
  );
}

export function RowActions({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cx(styles.actions, className)}>{children}</div>;
}

export function ReadOnly({
  wrap,
  strong,
  className,
  children,
}: {
  wrap?: boolean;
  strong?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return <span className={cx(styles.ro, wrap && styles.wrap, strong && styles.strong, className)}>{children}</span>;
}

export function DataInput({
  mono,
  className,
  onChange,
  maxLength,
  type = 'text',
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { mono?: boolean }) {
  const higienizar = TIPOS_TEXTO.includes(type);
  const limite = maxLength ?? LIMITE_TEXTO;
  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (higienizar) {
      const limpo = sanitizeText(e.currentTarget.value, { maxLength: limite });
      if (limpo !== e.currentTarget.value) e.currentTarget.value = limpo;
    }
    onChange?.(e);
  }
  return (
    <input
      type={type}
      maxLength={higienizar ? limite : undefined}
      className={cx(styles.control, mono && styles.mono, className)}
      onChange={handleChange}
      {...props}
    />
  );
}

export function DataSelect({ className, children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cx(styles.control, styles.select, className)} {...props}>
      {children}
    </select>
  );
}

export function DataTextarea({
  className,
  onChange,
  maxLength,
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const limite = maxLength ?? LIMITE_TEXTO_LONGO;
  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const limpo = sanitizeText(e.currentTarget.value, { maxLength: limite, multiline: true });
    if (limpo !== e.currentTarget.value) e.currentTarget.value = limpo;
    onChange?.(e);
  }
  return (
    <textarea
      maxLength={limite}
      className={cx(styles.control, styles.textarea, className)}
      onChange={handleChange}
      {...props}
    />
  );
}
