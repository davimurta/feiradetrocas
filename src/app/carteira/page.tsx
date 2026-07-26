import { requireUser } from '@/lib/guard';
import { getCarteira, getHistorico, getPedidosPendentesDoComprador } from '@/server/queries';
import { CarteiraAcoes } from '@/components/CarteiraAcoes';
import { PedidosPendentes } from '@/components/PedidosPendentes';

const ROTULO: Record<string, string> = {
  credito_entrada: 'Item entregue',
  debito_compra: 'Compra',
  ajuste_manual: 'Ajuste',
};

function sinal(tipo: string, valor: number) {
  const debito = tipo === 'debito_compra' || (tipo === 'ajuste_manual' && valor < 0);
  return { debito, magnitude: Math.abs(valor) };
}

function formatarData(d: Date): string {
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);
}

export default async function CarteiraPage() {
  const user = await requireUser();
  const [carteira, historico, pendentes] = await Promise.all([
    getCarteira(user.id),
    getHistorico(user.id),
    getPedidosPendentesDoComprador(user.id),
  ]);
  if (!carteira) return null;

  const primeiroNome = carteira.nome.split(' ')[0];

  return (
    <main className="screen stack">
      <h2 className="page-title">Olá, {primeiroNome}</h2>

      <PedidosPendentes initial={pendentes} />

      <div className="carteira-grid">
        <CarteiraAcoes saldo={carteira.saldo} codigoCarteira={carteira.codigoCarteira} />

        <div className="stack">
          <h2>Histórico de compras</h2>
          {historico.length === 0 ? (
            <div className="card center muted">Nenhuma transação ainda.</div>
          ) : (
            <div className="rows">
              {historico.map((t) => {
                const { debito, magnitude } = sinal(t.tipo, t.valor);
                return (
                  <div key={t.id} className="line">
                    <div className="stack-sm" style={{ gap: 2 }}>
                      <strong>{t.itemNome ?? ROTULO[t.tipo] ?? t.tipo}</strong>
                      <span className="muted" style={{ fontSize: '0.8rem' }}>
                        {ROTULO[t.tipo] ?? t.tipo}
                        {t.quantidade > 1 ? ` ×${t.quantidade}` : ''} · {formatarData(t.createdAt)}
                      </span>
                    </div>
                    <span className={`amount ${debito ? 'amount--debit' : 'amount--credit'}`}>
                      {debito ? '−' : '+'}
                      {magnitude}
                      <span className="un"> Fichas</span>
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
