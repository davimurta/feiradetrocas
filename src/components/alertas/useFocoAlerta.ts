'use client';

import { useEffect, useRef } from 'react';
import styles from './AlertasDiscrepancia.module.css';

export function useFocoAlerta<T extends HTMLElement>(ativo: boolean) {
  const ref = useRef<T>(null);
  useEffect(() => {
    if (ativo && ref.current) {
      ref.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [ativo]);
  return { ref, classe: ativo ? styles.alvo : undefined };
}
