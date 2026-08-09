'use client';

import { useId } from 'react';
import { cx } from '@/lib/cx';
import { sanitizeText, LIMITE_TEXTO_LONGO } from '@/lib/sanitize';
import { Field } from './Field';
import styles from './Field.module.css';

export function TextareaField({
  label,
  error,
  hint,
  id,
  className,
  containerClassName,
  onChange,
  maxLength,
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label?: React.ReactNode;
  error?: string | null;
  hint?: React.ReactNode;
  containerClassName?: string;
}) {
  const generated = useId();
  const inputId = id ?? generated;
  const limite = maxLength ?? LIMITE_TEXTO_LONGO;

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const limpo = sanitizeText(e.currentTarget.value, { maxLength: limite, multiline: true });
    if (limpo !== e.currentTarget.value) e.currentTarget.value = limpo;
    onChange?.(e);
  }

  return (
    <Field label={label} htmlFor={inputId} error={error} hint={hint} className={containerClassName}>
      <textarea
        id={inputId}
        maxLength={limite}
        className={cx(styles.input, styles.textarea, error && styles.invalid, className)}
        aria-invalid={error ? true : undefined}
        onChange={handleChange}
        {...props}
      />
    </Field>
  );
}
