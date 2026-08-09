'use client';

import { useId } from 'react';
import { cx } from '@/lib/cx';
import { Field } from './Field';
import styles from './Field.module.css';

export function SelectField({
  label,
  error,
  hint,
  id,
  className,
  containerClassName,
  children,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement> & {
  label?: React.ReactNode;
  error?: string | null;
  hint?: React.ReactNode;
  containerClassName?: string;
}) {
  const generated = useId();
  const inputId = id ?? generated;
  return (
    <Field label={label} htmlFor={inputId} error={error} hint={hint} className={containerClassName}>
      <select
        id={inputId}
        className={cx(styles.select, error && styles.invalid, className)}
        aria-invalid={error ? true : undefined}
        {...props}
      >
        {children}
      </select>
    </Field>
  );
}
