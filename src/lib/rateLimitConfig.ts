export type EscopoRate = 'login' | 'cadastro' | 'convite';

export interface PoliticaRate {
  falhas: number;
  janelaSegundos: number;
  bloqueioBaseSegundos: number;
  bloqueioMaximoSegundos: number;
}

function inteiro(valor: string | undefined, padrao: number): number {
  const n = Number(valor);
  return Number.isInteger(n) && n > 0 ? n : padrao;
}

function booleano(valor: string | undefined, padrao: boolean): boolean {
  if (valor === undefined || valor === '') return padrao;
  return valor === '1' || valor.toLowerCase() === 'true';
}

export function rateAtivo(): boolean {
  return booleano(process.env.RATE_LIMIT_ATIVO, true);
}

export function rateIpAtivo(): boolean {
  return booleano(process.env.RATE_LIMIT_IP_ATIVO, false);
}

export function proxiesConfiaveis(): number {
  const n = Number(process.env.PROXIES_CONFIAVEIS);
  return Number.isInteger(n) && n >= 0 ? n : 0;
}

export function politicaIdentidade(escopo: EscopoRate): PoliticaRate {
  if (escopo === 'convite') {
    return {
      falhas: inteiro(process.env.RATE_LIMIT_CONVITE_FALHAS, 40),
      janelaSegundos: inteiro(process.env.RATE_LIMIT_CONVITE_JANELA_SEG, 900),
      bloqueioBaseSegundos: inteiro(process.env.RATE_LIMIT_CONVITE_BLOQUEIO_SEG, 120),
      bloqueioMaximoSegundos: inteiro(process.env.RATE_LIMIT_BLOQUEIO_MAX_SEG, 3600),
    };
  }
  if (escopo === 'cadastro') {
    return {
      falhas: inteiro(process.env.RATE_LIMIT_CADASTRO_FALHAS, 3),
      janelaSegundos: inteiro(process.env.RATE_LIMIT_CADASTRO_JANELA_SEG, 900),
      bloqueioBaseSegundos: inteiro(process.env.RATE_LIMIT_CADASTRO_BLOQUEIO_SEG, 900),
      bloqueioMaximoSegundos: inteiro(process.env.RATE_LIMIT_BLOQUEIO_MAX_SEG, 3600),
    };
  }
  return {
    falhas: inteiro(process.env.RATE_LIMIT_FALHAS, 5),
    janelaSegundos: inteiro(process.env.RATE_LIMIT_JANELA_SEG, 900),
    bloqueioBaseSegundos: inteiro(process.env.RATE_LIMIT_BLOQUEIO_SEG, 300),
    bloqueioMaximoSegundos: inteiro(process.env.RATE_LIMIT_BLOQUEIO_MAX_SEG, 3600),
  };
}

export function politicaIp(escopo: EscopoRate): PoliticaRate {
  const base = politicaIdentidade(escopo);
  return {
    ...base,
    falhas: inteiro(
      escopo === 'cadastro' ? process.env.RATE_LIMIT_IP_CADASTRO_FALHAS : process.env.RATE_LIMIT_IP_FALHAS,
      escopo === 'cadastro' ? 60 : 200,
    ),
  };
}

export function retencaoTentativasHoras(): number {
  return inteiro(process.env.RATE_LIMIT_RETENCAO_HORAS, 72);
}
