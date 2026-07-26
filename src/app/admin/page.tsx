import { Papel } from '@prisma/client';
import { requireUser } from '@/lib/guard';
import {
  getAdminDashboard,
  getTransacoesRecentes,
  listarItensAdmin,
  listarUsuariosAdmin,
} from '@/server/queries';
import { AdminConsole } from '@/components/admin/AdminConsole';

/** Painel do admin: tabs (Métricas/Usuários/Itens) + filtro de unidade. */
export default async function AdminPage() {
  await requireUser(Papel.admin);
  const [dashboard, recentes, itens, usuarios] = await Promise.all([
    getAdminDashboard(),
    getTransacoesRecentes(),
    listarItensAdmin(),
    listarUsuariosAdmin(),
  ]);

  return <AdminConsole dashboard={dashboard} recentes={recentes} itens={itens} usuarios={usuarios} />;
}
