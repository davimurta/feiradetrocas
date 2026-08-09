import { describe, it, expect } from 'vitest';
import { sanitizeText } from '@/lib/sanitize';

const NUL = String.fromCharCode(0);
const BEL = String.fromCharCode(7);
const ZWSP = String.fromCharCode(0x200b);
const RLO = String.fromCharCode(0x202e);
const BOM = String.fromCharCode(0xfeff);

describe('sanitizeText', () => {
  it('remove caracteres de controle', () => {
    expect(sanitizeText('a' + NUL + 'b' + BEL + 'c')).toBe('abc');
  });

  it('remove zero-width, bidi e BOM', () => {
    expect(sanitizeText('a' + ZWSP + 'b' + RLO + 'c' + BOM)).toBe('abc');
  });

  it('corta no tamanho máximo', () => {
    expect(sanitizeText('abcdef', { maxLength: 3 })).toBe('abc');
  });

  it('texto simples (inline) não guarda quebras de linha', () => {
    expect(sanitizeText('a\nb')).toBe('ab');
  });

  it('multiline preserva \\n mas remove outros controles', () => {
    expect(sanitizeText('a\nb' + BEL + 'c', { multiline: true })).toBe('a\nbc');
  });

  it('multiline normaliza CRLF para LF', () => {
    expect(sanitizeText('a\r\nb', { multiline: true })).toBe('a\nb');
  });

  it('preserva acentos', () => {
    expect(sanitizeText('Ação é ótimo')).toBe('Ação é ótimo');
  });
});
