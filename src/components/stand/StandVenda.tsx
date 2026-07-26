'use client';

import { useEffect, useRef, useState } from 'react';
import { MagnifyingGlass, CheckCircle, XCircle, Hourglass } from '@phosphor-icons/react/dist/ssr';
import type { ActionResult } from '@/app/actions/_result';
import type { ProdutoView, AlunoView, PedidoStatusView } from '@/server/queries';
import type { CriarPedidoResult } from '@/domain/pedido';
import { CodeScanner } from '@/components/CodeScanner';
import { ProdutoThumb } from '@/components/ProdutoThumb';
import { mensagemErro } from '@/lib/mensagens';

export function StandVenda({
  initial,
  buscarCatalogo,
  buscarComprador,
  criarPedido,
  consultarPedido,
  cancelarPedido,
}: {
  initial: ProdutoView[];
  buscarCatalogo: (input: { busca?: string }) => Promise<ActionResult<ProdutoView[]>>;
  buscarComprador: (input: { codigo: string }) => Promise<ActionResult<AlunoView>>;
  criarPedido: (input: { itemId: string; codigoCarteira: string }) => Promise<ActionResult<CriarPedidoResult>>;
  consultarPedido: (input: { pedidoId: string }) => Promise<ActionResult<PedidoStatusView>>;
  cancelarPedido: (input: { pedidoId: string }) => Promise<ActionResult<{ ok: true }>>;
}) {
  const [itens, setItens] = useState<ProdutoView[]>(initial);
  const [busca, setBusca] = useState('');
  const [item, setItem] = useState<ProdutoView | null>(null);
  const [comprador, setComprador] = useState<AlunoView | null>(null);
  const [pedido, setPedido] = useState<CriarPedidoResult | null>(null);
  const [status, setStatus] = useState<'pendente' | 'aprovado' | 'recusado' | 'cancelado'>('pendente');
  const [erro, setErro] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const deb = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (deb.current) clearTimeout(deb.current);
    deb.current = setTimeout(async () => {
      const res = await buscarCatalogo({ busca });
      if (res.ok) setItens(res.data);
    }, 250);
    return () => {
      if (deb.current) clearTimeout(deb.current);
    };
  }, [busca, buscarCatalogo]);

  useEffect(() => {
    if (!pedido || status !== 'pendente') return;
    const t = setInterval(async () => {
      const res = await consultarPedido({ pedidoId: pedido.pedidoId });
      if (res.ok && res.data.status !== 'pendente') {
        setStatus(res.data.status as 'aprovado' | 'recusado' | 'cancelado');
      }
    }, 2500);
    return () => clearInterval(t);
  }, [pedido, status, consultarPedido]);

  async function acharComprador(codigo: string) {
    setErro(null);
    setBusy(true);
    const res = await buscarComprador({ codigo });
    setBusy(false);
    if (res.ok) setComprador(res.data);
    else setErro(mensagemErro(res.error.code, res.error.message));
  }

  async function enviar() {
    if (!item || !comprador) return;
    setErro(null);
    setBusy(true);
    const res = await criarPedido({ itemId: item.id, codigoCarteira: comprador.codigoCarteira });
    setBusy(false);
    if (res.ok) {
      setPedido(res.data);
      setStatus('pendente');
    } else setErro(mensagemErro(res.error.code, res.error.message));
  }

  async function cancelar() {
    if (!pedido) return;
    setBusy(true);
    await cancelarPedido({ pedidoId: pedido.pedidoId });
    setBusy(false);
    setStatus('cancelado');
  }

  async function novaVenda() {
    setItem(null);
    setComprador(null);
    setPedido(null);
    setStatus('pendente');
    setErro(null);
    const res = await buscarCatalogo({ busca });
    if (res.ok) setItens(res.data);
  }

  if (pedido) {
    if (status === 'aprovado') {
      return (
        <ResultadoCard
          icon={<CheckCircle size={56} weight="fill" color="var(--green)" />}
          titulo="Venda aprovada"
          texto={`${pedido.compradorNome} aprovou a compra de ${pedido.itemNome} (${pedido.valor} fichas).`}
          onNova={novaVenda}
        />
      );
    }
    if (status === 'recusado') {
      return (
        <ResultadoCard
          icon={<XCircle size={56} weight="fill" color="var(--danger-fg)" />}
          titulo="Compra recusada"
          texto={`${pedido.compradorNome} não concluiu a compra de ${pedido.itemNome}.`}
          onNova={novaVenda}
        />
      );
    }
    if (status === 'cancelado') {
      return (
        <ResultadoCard
          icon={<XCircle size={56} weight="fill" color="var(--muted)" />}
          titulo="Pedido cancelado"
          texto="O pedido foi cancelado."
          onNova={novaVenda}
        />
      );
    }
    // pendente
    return (
      <div className="stack">
        <div className="card center stack" style={{ paddingTop: 26, paddingBottom: 26 }}>
          <Hourglass size={52} weight="duotone" color="var(--green-dark)" className="spin-slow" />
          <h2>Aguardando aprovação</h2>
          <p className="muted">
            <b>{pedido.compradorNome}</b> precisa aprovar a compra de <b>{pedido.itemNome}</b> (
            <b className="mono">{pedido.valor}</b> fichas) na carteira.
          </p>
          {!pedido.suficiente && (
            <div className="alert alert--error" role="alert">
              Atenção: o saldo do comprador pode ser insuficiente ({pedido.compradorSaldo} fichas).
            </div>
          )}
        </div>
        <button className="btn btn--ghost btn--block" onClick={cancelar} disabled={busy}>
          Cancelar pedido
        </button>
      </div>
    );
  }

  return (
    <div className="stack">
      {!item ? (
        <div className="stack">
          <div className="row-between">
            <h2>Escolha o item</h2>
            <div className="search">
              <input
                className="input"
                placeholder="Pesquisar"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                aria-label="Pesquisar item"
              />
              <span className="ico" aria-hidden>
                <MagnifyingGlass size={18} />
              </span>
            </div>
          </div>
          {itens.length === 0 ? (
            <div className="card center muted">Nenhum item com estoque nesta unidade.</div>
          ) : (
            <div className="catalogo">
              {itens.map((p) => (
                <button key={p.id} type="button" className="produto" onClick={() => setItem(p)} aria-label={`Vender ${p.nome}`}>
                  <div className="thumb">
                    <ProdutoThumb />
                  </div>
                  <span className="cat">{p.categoria}</span>
                  <span className="nome">{p.nome}</span>
                  <span className="meta">
                    Preço: <b>{p.valor}</b> Fichas
                  </span>
                  <span className="meta">
                    Estoque: <b>{p.quantidade}</b>
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="card stack-sm">
          <div className="row-between">
            <span className="cat">Item selecionado</span>
            <button className="btn btn--ghost" onClick={() => setItem(null)} disabled={busy}>
              Trocar
            </button>
          </div>
          <strong className="nome">{item.nome}</strong>
          <span className="muted">{item.categoria}</span>
          <span className="mono" style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--green)' }}>
            {item.valor} fichas
          </span>
        </div>
      )}

      {item && (
        <>
          {!comprador ? (
            <CodeScanner
              label="Carteira do comprador (QR ou matrícula)"
              placeholder="CAR-… ou matrícula"
              submitLabel="Buscar"
              onSubmit={acharComprador}
              busy={busy}
            />
          ) : (
            <div className="card stack-sm">
              <div className="row-between">
                <strong>{comprador.nome}</strong>
                <button className="btn btn--ghost" onClick={() => setComprador(null)} disabled={busy}>
                  Trocar
                </button>
              </div>
              <span className="mono muted">{comprador.codigoCarteira}</span>
              <span className="mono">Saldo: {comprador.saldo} fichas</span>
            </div>
          )}
        </>
      )}

      {erro && (
        <div className="alert alert--error" role="alert">
          {erro}
        </div>
      )}

      {item && comprador && (
        <button className="btn btn--primary btn--lg btn--block" onClick={enviar} disabled={busy}>
          {busy ? 'Enviando…' : `Enviar para aprovação · ${item.valor} fichas`}
        </button>
      )}
    </div>
  );
}

function ResultadoCard({
  icon,
  titulo,
  texto,
  onNova,
}: {
  icon: React.ReactNode;
  titulo: string;
  texto: string;
  onNova: () => void;
}) {
  return (
    <div className="stack">
      <div className="card center stack" style={{ paddingTop: 26, paddingBottom: 26 }}>
        {icon}
        <h2>{titulo}</h2>
        <p className="muted">{texto}</p>
      </div>
      <button className="btn btn--primary btn--lg btn--block" onClick={onNova} autoFocus>
        Nova venda
      </button>
    </div>
  );
}
