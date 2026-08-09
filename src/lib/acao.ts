import type { ActionResult } from '@/app/actions/_result';

/**
 * Envolve a chamada de uma server action tratando falhas de REDE (fetch abortado, servidor
 * reiniciando, aba suspensa → ERR_NETWORK_IO_SUSPENDED). Nunca rejeita: devolve um
 * ActionResult com código 'REDE', para o chamador tratar como qualquer outro erro (ou ignorar,
 * no caso de polling).
 */
export async function chamar<T>(p: Promise<ActionResult<T>>): Promise<ActionResult<T>> {
  try {
    return await p;
  } catch {
    return { ok: false, error: { code: 'REDE', message: 'Sem conexão com o servidor. Tente novamente.' } };
  }
}
