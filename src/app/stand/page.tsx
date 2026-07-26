import { Papel } from '@prisma/client';
import { requireUser } from '@/lib/guard';
import { getCatalogo } from '@/server/queries';
import {
  criarPedidoAction,
  consultarPedidoAction,
  cancelarPedidoAction,
  buscarCatalogoStandAction,
  buscarCompradorAction,
} from '@/app/actions/venda';
import { StandVenda } from '@/components/stand/StandVenda';

export default async function StandPage() {
  const user = await requireUser(Papel.atendente_stand, Papel.admin);
  const itens = await getCatalogo(user.unidade);

  return (
    <main className="screen stack">
      <div className="row-between">
        <h1 className="page-title">Stand · Caixa</h1>
        <span className="unidade-tag">Unidade {user.unidade}</span>
      </div>
      <StandVenda
        initial={itens}
        buscarCatalogo={buscarCatalogoStandAction}
        buscarComprador={buscarCompradorAction}
        criarPedido={criarPedidoAction}
        consultarPedido={consultarPedidoAction}
        cancelarPedido={cancelarPedidoAction}
      />
    </main>
  );
}
