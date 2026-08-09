import { Papel } from '@prisma/client';
import { requireUser } from '@/lib/guard';
import {
  getTransacoesRecentes,
  listarItensAdmin,
  listarUsuariosAdmin,
  listarReportes,
  getAlertasCatalogo,
} from '@/server/queries';
import { getMetricas } from '@/server/metricas';
import { resolverFiltro } from '@/lib/filtroMetricas';
import { AdminConsole } from '@/components/admin/AdminConsole';

export default async function AdminPage() {
  await requireUser(Papel.admin);
  const [metricas, recentes, itens, usuarios, reportes, alertas] = await Promise.all([
    getMetricas(resolverFiltro()),
    getTransacoesRecentes(),
    listarItensAdmin(),
    listarUsuariosAdmin(),
    listarReportes(),
    getAlertasCatalogo(),
  ]);

  return (
    <AdminConsole
      metricas={metricas}
      recentes={recentes}
      itens={itens}
      usuarios={usuarios}
      reportes={reportes}
      alertas={alertas}
    />
  );
}
