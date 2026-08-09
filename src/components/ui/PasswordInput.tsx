'use client';

import { useId, useState } from 'react';
import { Eye, EyeSlash } from '@phosphor-icons/react/dist/ssr';
import { cx } from '@/lib/cx';
import { Field } from './Field';
import fieldStyles from './Field.module.css';
import styles from './PasswordInput.module.css';

export function PasswordInput({
  label,
  error,
  hint,
  id,
  className,
  containerClassName,
  maxLength = 128,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & {
  label?: React.ReactNode;
  error?: string | null;
  hint?: React.ReactNode;
  containerClassName?: string;
}) {
  const generated = useId();
  const inputId = id ?? generated;
  const [show, setShow] = useState(false);
  return (
    <Field label={label} htmlFor={inputId} error={error} hint={hint} className={containerClassName}>
      <div className={styles.wrap}>
        <input
          id={inputId}
          type={show ? 'text' : 'password'}
          maxLength={maxLength}
          className={cx(fieldStyles.input, styles.input, error && fieldStyles.invalid, className)}
          aria-invalid={error ? true : undefined}
          {...props}
        />
        <button
          type="button"
          className={styles.eye}
          onClick={() => setShow((s) => !s)}
          aria-label={show ? 'Ocultar senha' : 'Mostrar senha'}
        >
          {show ? <EyeSlash size={20} /> : <Eye size={20} />}
        </button>
      </div>
    </Field>
  );
}
