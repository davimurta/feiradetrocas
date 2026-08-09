const MENSAGENS: Record<string, string> = {
  SALDO_INSUFICIENTE: 'Saldo insuficiente para esta compra.',
  ITEM_INDISPONIVEL: 'Item esgotado.',
  ITEM_INEXISTENTE: 'Item não encontrado.',
  ITEM_NAO_PENDENTE: 'Este item já foi colocado em produção.',
  CARTEIRA_INEXISTENTE: 'Comprador não encontrado. Confira a carteira/matrícula.',
  PARTICIPANTE_INEXISTENTE: 'Participante não encontrado.',
  ALUNO_INEXISTENTE: 'Aluno não encontrado.',
  CODIGO_DUPLICADO: 'Este código já está em uso.',
  VALOR_INVALIDO: 'Valor inválido. Use um número inteiro de fichas.',
  EMAIL_INVALIDO: 'Email inválido.',
  CREDENCIAL_INVALIDA: 'Email ou senha incorretos.',
  PEDIDO_INEXISTENTE: 'Pedido não encontrado.',
  PEDIDO_NAO_PENDENTE: 'Este pedido não está mais pendente.',
  NAO_AUTENTICADO: 'Você precisa estar identificado para fazer isso.',
  NAO_AUTORIZADO: 'Seu perfil não tem permissão para esta ação.',
  CONTA_BLOQUEADA: 'Sua conta está bloqueada. Procure a organização da feira.',
  REDE: 'Sem conexão com o servidor. Tente novamente.',
  VALIDACAO: 'Confira os dados informados.',
};

export function mensagemErro(code: string, fallback?: string): string {
  return MENSAGENS[code] ?? fallback ?? 'Não foi possível completar a operação.';
}
