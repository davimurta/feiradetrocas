import { Papel } from '@prisma/client';
import { requireUser } from '@/lib/guard';
import {
  receberItemAction,
  buscarItensPorNomeAction,
  buscarAlunoAction,
} from '@/app/actions/entrada';
import { RecepcaoForm } from '@/components/entrada/RecepcaoForm';

export default async function EntradaPage() {
  const user = await requireUser(Papel.atendente_entrada, Papel.admin);

  return (
    <main className="screen stack">
      <h1 className="page-title">Central de Atendimento</h1>
      <h2 className="card-title">Cadastro de itens</h2>
      <RecepcaoForm
        unidadePadrao={user.unidade}
        receber={receberItemAction}
        buscarItens={buscarItensPorNomeAction}
        buscarAluno={buscarAlunoAction}
      />
    </main>
  );
}
