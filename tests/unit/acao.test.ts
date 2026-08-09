import { describe, it, expect } from 'vitest';
import { chamar } from '@/lib/acao';

describe('chamar (proteção de rede nas server actions)', () => {
  it('repassa o resultado quando a action resolve normalmente', async () => {
    const r = await chamar(Promise.resolve({ ok: true, data: 42 } as const));
    expect(r).toEqual({ ok: true, data: 42 });
  });

  it('repassa erros de domínio sem alterar', async () => {
    const r = await chamar(Promise.resolve({ ok: false, error: { code: 'SALDO_INSUFICIENTE', message: 'x' } } as const));
    expect(r).toEqual({ ok: false, error: { code: 'SALDO_INSUFICIENTE', message: 'x' } });
  });

  it('converte falha de rede (fetch rejeitado) em ActionResult REDE, sem rejeitar', async () => {
    const r = await chamar(Promise.reject(new TypeError('Failed to fetch')));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('REDE');
  });
});
