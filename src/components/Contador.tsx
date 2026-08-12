'use client';

import { useEffect, useState } from 'react';

export function formatarEspera(segundos: number): string {
  const s = Math.max(0, Math.ceil(segundos));
  if (s < 60) return `${s}s`;
  const min = Math.floor(s / 60);
  const resto = s % 60;
  return resto === 0 ? `${min}min` : `${min}min ${String(resto).padStart(2, '0')}s`;
}

export function Contador({ segundos, aoZerar }: { segundos: number; aoZerar?: () => void }) {
  const [restante, setRestante] = useState(segundos);

  useEffect(() => setRestante(segundos), [segundos]);

  useEffect(() => {
    if (restante <= 0) {
      aoZerar?.();
      return;
    }
    const timer = setTimeout(() => setRestante((v) => v - 1), 1000);
    return () => clearTimeout(timer);
  }, [restante, aoZerar]);

  return <>{formatarEspera(restante)}</>;
}
