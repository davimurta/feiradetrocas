'use client';

import { useId } from 'react';
import { cx } from '@/lib/cx';
import { sanitizeText, LIMITE_TEXTO } from '@/lib/sanitize';
import { Field } from './Field';
import styles from './Field.module.css';

const TIPOS_TEXTO = ['text', 'email', 'search', 'tel', 'url'];

export function TextInput({
  label,
  error,
  hint,
  mono,
  id,
  className,
  containerClassName,
  onChange,
  maxLength,
  type = 'text',
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & {
  label?: React.ReactNode;
  error?: string | null;
  hint?: React.ReactNode;
  mono?: boolean;
  containerClassName?: string;
}) {
  const generated = useId();
  const inputId = id ?? generated;
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
    <Field label={label} htmlFor={inputId} error={error} hint={hint} className={containerClassName}>
      <input
        id={inputId}
        type={type}
        maxLength={higienizar ? limite : undefined}
        className={cx(styles.input, mono && styles.mono, error && styles.invalid, className)}
        aria-invalid={error ? true : undefined}
        onChange={handleChange}
        {...props}
      />
    </Field>
  );
}
