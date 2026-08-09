import { Papel } from '@prisma/client';
import { requireUser } from '@/lib/guard';
import { listarItensPendentes, getAlertasItensPendentes } from '@/server/queries';
import { EntradaConsole } from '@/components/entrada/EntradaConsole';

export default async function EntradaPage() {
  const user = await requireUser(Papel.atendente_entrada, Papel.admin);
  const [pendentes, alertas] = await Promise.all([listarItensPendentes(), getAlertasItensPendentes()]);

  return (
    <main className="screen stack">
      <h1 className="page-title">Central de Atendimento</h1>
      <EntradaConsole unidadePadrao={user.unidade} pendentesIniciais={pendentes} alertasIniciais={alertas} />
    </main>
  );
}
