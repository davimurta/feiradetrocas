'use server';

import { getCurrentUser } from '@/lib/auth';
import { DomainError } from '@/lib/errors';
import {
  getCarteira,
  getHistorico,
  getPedidosPendentesDoComprador,
  type ExtratoItem,
  type PedidoPendenteView,
} from '@/server/queries';
import { ok, fail, type ActionResult } from './_result';

export interface CarteiraSync {
  saldo: number;
  historico: ExtratoItem[];
  pendentes: PedidoPendenteView[];
}

/**
 * Estado completo da carteira do próprio usuário em uma única ida ao servidor.
 *
 * Existe porque o crédito de fichas nasce FORA desta tela: quem faz o push é a recepção,
 * na máquina dela. Sem isto, o aluno com a carteira aberta só via o saldo novo depois de
 * um F5. Uma action só (em vez de três) para não triplicar as requisições do polling.
 */
export async function sincronizarCarteiraAction(): Promise<ActionResult<CarteiraSync>> {
  try {
    const user = await getCurrentUser();
    if (!user) throw new DomainError('NAO_AUTENTICADO', 'Faça login.');
    if (user.bloqueado) throw new DomainError('CONTA_BLOQUEADA', 'Conta bloqueada.');

    const [carteira, historico, pendentes] = await Promise.all([
      getCarteira(user.id),
      getHistorico(user.id),
      getPedidosPendentesDoComprador(user.id),
    ]);
    if (!carteira) throw new DomainError('CARTEIRA_INEXISTENTE', 'Carteira não encontrada.');

    return ok({ saldo: carteira.saldo, historico, pendentes });
  } catch (err) {
    return fail(err);
  }
}
