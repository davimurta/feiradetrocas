import { describe, it, expect } from 'vitest';
import { formatarCodigo, normalizarCodigo, codigoPlausivel, TAMANHO_CODIGO } from '@/lib/convite';
import { gerarCodigo, gerarCodigoCarteira } from '@/lib/conviteGerador';

describe('código de convite', () => {
  it('sai formatado em dois blocos de quatro', () => {
    const codigo = gerarCodigo();
    expect(codigo).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/);
    expect(normalizarCodigo(codigo)).toHaveLength(TAMANHO_CODIGO);
  });

  it('não usa caracteres que se confundem ao ditar ou copiar', () => {
    const amostra = Array.from({ length: 300 }, () => normalizarCodigo(gerarCodigo())).join('');
    for (const ambiguo of ['I', 'L', 'O', '0', '1']) {
      expect(amostra).not.toContain(ambiguo);
    }
  });

  it('não repete na prática', () => {
    const codigos = new Set(Array.from({ length: 500 }, gerarCodigo));
    expect(codigos.size).toBe(500);
  });

  it('normaliza o que a pessoa digita: minúscula, espaço, hífen', () => {
    const codigo = gerarCodigo();
    const limpo = normalizarCodigo(codigo);
    expect(normalizarCodigo(codigo.toLowerCase())).toBe(limpo);
    expect(normalizarCodigo(` ${codigo} `)).toBe(limpo);
    expect(normalizarCodigo(limpo)).toBe(limpo);
  });

  it('reconhece formato válido e recusa o resto', () => {
    expect(codigoPlausivel(gerarCodigo())).toBe(true);
    expect(codigoPlausivel(gerarCodigo().toLowerCase())).toBe(true);
    expect(codigoPlausivel('')).toBe(false);
    expect(codigoPlausivel('ABC')).toBe(false);
    expect(codigoPlausivel('ABCDEFGHI')).toBe(false);
    expect(codigoPlausivel('ABCD-EFG0')).toBe(false);
    expect(codigoPlausivel('ABCD-EFGI')).toBe(false);
  });

  it('formatar é idempotente', () => {
    const codigo = gerarCodigo();
    expect(formatarCodigo(formatarCodigo(codigo))).toBe(codigo);
    expect(formatarCodigo(normalizarCodigo(codigo))).toBe(codigo);
  });

  it('carteira de convite é distinguível de matrícula', () => {
    for (let i = 0; i < 50; i++) {
      const carteira = gerarCodigoCarteira();
      expect(carteira).toMatch(/^v\d{6}$/);
      expect(carteira).toBe(carteira.toLowerCase());
      expect(/^\d+$/.test(carteira)).toBe(false);
    }
  });
});
