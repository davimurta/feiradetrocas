'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle, XCircle } from '@phosphor-icons/react/dist/ssr';
import {
  listarPedidosPendentesAction,
  aprovarPedidoAction,
  recusarPedidoAction,
} from '@/app/actions/pedido';
import { mensagemErro } from '@/lib/mensagens';
import type { PedidoPendenteView } from '@/server/queries';

export function PedidosPendentes({ initial }: { initial: PedidoPendenteView[] }) {
  const router = useRouter();
  const [pedidos, setPedidos] = useState<PedidoPendenteView[]>(initial);
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    const t = setInterval(async () => {
      const r = await listarPedidosPendentesAction();
      if (r.ok) setPedidos(r.data);
    }, 4000);
    return () => clearInterval(t);
  }, []);

  async function aprovar(id: string) {
    setBusyId(id);
    setMsg(null);
    const r = await aprovarPedidoAction({ pedidoId: id });
    setBusyId(null);
    if (r.ok) {
      setPedidos((p) => p.filter((x) => x.id !== id));
      setMsg({ ok: true, texto: `Compra aprovada: −${r.data.valor} fichas (${r.data.itemNome}).` });
      router.refresh();
    } else {
      setMsg({ ok: false, texto: mensagemErro(r.error.code, r.error.message) });
      setPedidos((p) => p.filter((x) => x.id !== id));
    }
  }

  async function recusar(id: string) {
    setBusyId(id);
    setMsg(null);
    const r = await recusarPedidoAction({ pedidoId: id });
    setBusyId(null);
    if (r.ok) {
      setPedidos((p) => p.filter((x) => x.id !== id));
      setMsg({ ok: true, texto: 'Compra recusada.' });
    } else setMsg({ ok: false, texto: mensagemErro(r.error.code, r.error.message) });
  }

  if (pedidos.length === 0 && !msg) return null;

  return (
    <section className="stack-sm" data-testid="pedidos-pendentes">
      <h2>Compras aguardando você</h2>
      {msg && (
        <div className={`alert ${msg.ok ? 'alert--success' : 'alert--error'}`} role="status">
          {msg.texto}
        </div>
      )}
      {pedidos.map((p) => (
        <div key={p.id} className="card stack-sm" data-testid="pedido-pendente">
          <div className="row-between">
            <strong>{p.itemNome}</strong>
            <span className="mono" style={{ color: 'var(--danger-fg)', fontWeight: 700 }}>
              −{p.valor} fichas
            </span>
          </div>
          <span className="muted" style={{ fontSize: '0.82rem' }}>
            Stand: {p.atendenteNome} · unidade {p.unidade}
          </span>
          <div className="row">
            <button className="btn btn--primary grow" onClick={() => aprovar(p.id)} disabled={busyId === p.id}>
              <CheckCircle size={18} weight="bold" /> Aprovar
            </button>
            <button className="btn btn--ghost grow" onClick={() => recusar(p.id)} disabled={busyId === p.id}>
              <XCircle size={18} weight="bold" /> Recusar
            </button>
          </div>
        </div>
      ))}
    </section>
  );
}
