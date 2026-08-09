import { requireUser } from '@/lib/guard';
import { getCarteira, getHistorico, getPedidosPendentesDoComprador } from '@/server/queries';
import { Carteira } from '@/components/carteira/Carteira';

export default async function CarteiraPage() {
  const user = await requireUser();
  const [carteira, historico, pendentes] = await Promise.all([
    getCarteira(user.id),
    getHistorico(user.id),
    getPedidosPendentesDoComprador(user.id),
  ]);
  if (!carteira) return null;

  return (
    <Carteira
      nome={carteira.nome}
      saldo={carteira.saldo}
      codigoCarteira={carteira.codigoCarteira}
      historico={historico}
      pendentes={pendentes}
    />
  );
}
