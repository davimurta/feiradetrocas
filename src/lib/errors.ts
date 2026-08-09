export type DomainErrorCode =
  | 'ITEM_INEXISTENTE'
  | 'ITEM_INDISPONIVEL' // sem estoque (quantidade 0)
  | 'ITEM_NAO_PENDENTE' // item já foi colocado em produção
  | 'CARTEIRA_INEXISTENTE'
  | 'PARTICIPANTE_INEXISTENTE'
  | 'ALUNO_INEXISTENTE'
  | 'SALDO_INSUFICIENTE'
  | 'VALOR_INVALIDO'
  | 'CODIGO_DUPLICADO'
  | 'EMAIL_INVALIDO'
  | 'CREDENCIAL_INVALIDA'
  | 'PEDIDO_INEXISTENTE'
  | 'PEDIDO_NAO_PENDENTE'
  | 'NAO_AUTENTICADO'
  | 'NAO_AUTORIZADO'
  | 'CONTA_BLOQUEADA';

export class DomainError extends Error {
  readonly code: DomainErrorCode;

  constructor(code: DomainErrorCode, message: string) {
    super(message);
    this.name = 'DomainError';
    this.code = code;
  }
}

export function isDomainError(err: unknown): err is DomainError {
  return err instanceof DomainError;
}
