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
  CONFIRMACAO_INVALIDA: 'Digite CONFIRMAR para executar esta ação.',
  MUITAS_TENTATIVAS: 'Muitas tentativas. Aguarde antes de tentar de novo.',
  CADASTRO_INDISPONIVEL:
    'Não foi possível confirmar seu vínculo com o Cotemig agora. Tente novamente em alguns minutos.',
  CONFLITO_CADASTRO: 'Já existe uma conta usando estes dados. Procure a organização da feira.',
  CONVITE_INVALIDO: 'Código de convite inválido ou expirado. Peça um novo à organização.',
  EMAIL_EM_USO: 'Já existe uma conta com esse email. Entre em vez de criar outra.',
  REDE: 'Sem conexão com o servidor. Tente novamente.',
  VALIDACAO: 'Confira os dados informados.',
};

export function mensagemErro(code: string, fallback?: string): string {
  return MENSAGENS[code] ?? fallback ?? 'Não foi possível completar a operação.';
}
