import { describe, it, expect } from 'vitest';
import { ipDoCabecalho } from '@/lib/ip';

describe('ipDoCabecalho', () => {
  it('sem proxy confiável configurado, ignora o cabeçalho', () => {
    expect(ipDoCabecalho('1.2.3.4', 0)).toBeNull();
    expect(ipDoCabecalho('9.9.9.9, 1.2.3.4', 0)).toBeNull();
  });

  it('um proxy à frente: o IP é o que o proxy anexou', () => {
    expect(ipDoCabecalho('1.2.3.4', 1)).toBe('1.2.3.4');
  });

  it('cabeçalho forjado pelo cliente é descartado, o que vale é o que o proxy anexou', () => {
    // O cliente mandou "forjado"; o nosso proxy anexou o IP real de quem conectou nele.
    expect(ipDoCabecalho('forjado, 1.2.3.4', 1)).toBe('1.2.3.4');
    expect(ipDoCabecalho('forjado, outro.forjado, 1.2.3.4', 1)).toBe('1.2.3.4');
  });

  it('dois proxies à frente: anda uma casa a mais para a esquerda', () => {
    // CDN anexa o cliente, load balancer anexa a CDN.
    expect(ipDoCabecalho('1.2.3.4, 10.0.0.1', 2)).toBe('1.2.3.4');
    expect(ipDoCabecalho('forjado, 1.2.3.4, 10.0.0.1', 2)).toBe('1.2.3.4');
  });

  it('configurar proxies demais devolve null em vez de um IP errado', () => {
    expect(ipDoCabecalho('10.0.0.1', 2)).toBeNull();
    expect(ipDoCabecalho('1.2.3.4, 10.0.0.1', 5)).toBeNull();
  });

  it('cabeçalho ausente ou vazio devolve null', () => {
    expect(ipDoCabecalho(null, 1)).toBeNull();
    expect(ipDoCabecalho('', 1)).toBeNull();
    expect(ipDoCabecalho('  ,  ', 1)).toBeNull();
  });
});
