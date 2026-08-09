'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, X, Hourglass, Flag } from '@phosphor-icons/react/dist/ssr';
import type { ActionResult } from '@/app/actions/_result';
import type { ProdutoView, AlunoView, PedidoStatusView } from '@/server/queries';
import type { CriarPedidoResult } from '@/domain/pedido';
import type { CriarReporteResult } from '@/domain/reporte';
import { cx } from '@/lib/cx';
import { mensagemErro } from '@/lib/mensagens';
import { chamar } from '@/lib/acao';
import { Alert, Button, SearchField } from '@/components/ui';
import { CodeScanner } from '@/components/CodeScanner';
import { CatalogoGrid } from './CatalogoGrid';
import { ReportarModal } from './ReportarModal';
import styles from './StandVenda.module.css';

export function StandVenda({
  initial,
  buscarCatalogo,
  buscarComprador,
  criarPedido,
  consultarPedido,
  cancelarPedido,
  reportar,
}: {
  initial: ProdutoView[];
  buscarCatalogo: (input: { busca?: string }) => Promise<ActionResult<ProdutoView[]>>;
  buscarComprador: (input: { codigo: string }) => Promise<ActionResult<AlunoView>>;
  criarPedido: (input: { itemId: string; codigoCarteira: string }) => Promise<ActionResult<CriarPedidoResult>>;
  consultarPedido: (input: { pedidoId: string }) => Promise<ActionResult<PedidoStatusView>>;
  cancelarPedido: (input: { pedidoId: string }) => Promise<ActionResult<{ ok: true }>>;
  reportar: (input: { pedidoId: string; motivo: string; descricao?: string }) => Promise<ActionResult<CriarReporteResult>>;
}) {
  const [itens, setItens] = useState<ProdutoView[]>(initial);
  const [busca, setBusca] = useState('');
  const [item, setItem] = useState<ProdutoView | null>(null);
  const [comprador, setComprador] = useState<AlunoView | null>(null);
  const [pedido, setPedido] = useState<CriarPedidoResult | null>(null);
  const [status, setStatus] = useState<'pendente' | 'aprovado' | 'recusado' | 'cancelado'>('pendente');
  const [erro, setErro] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [reportarAberto, setReportarAberto] = useState(false);
  const deb = useRef<ReturnType<typeof setTimeout> | null>(null);
  const primeiroRender = useRef(true);

  useEffect(() => {
    // O catálogo inicial vem do servidor; não refazemos a busca no primeiro render.
    if (primeiroRender.current) {
      primeiroRender.current = false;
      return;
    }
    if (deb.current) clearTimeout(deb.current);
    deb.current = setTimeout(async () => {
      const res = await chamar(buscarCatalogo({ busca }));
      if (res.ok) setItens(res.data);
    }, 250);
    return () => {
      if (deb.current) clearTimeout(deb.current);
    };
  }, [busca, buscarCatalogo]);

  useEffect(() => {
    if (!pedido || status !== 'pendente') return;
    const t = setInterval(async () => {
      const res = await chamar(consultarPedido({ pedidoId: pedido.pedidoId }));
      if (res.ok && res.data.status !== 'pendente') {
        setStatus(res.data.status as 'aprovado' | 'recusado' | 'cancelado');
      }
    }, 2500);
    return () => clearInterval(t);
  }, [pedido, status, consultarPedido]);

  async function acharComprador(codigo: string) {
    setErro(null);
    setBusy(true);
    const res = await chamar(buscarComprador({ codigo }));
    setBusy(false);
    if (res.ok) setComprador(res.data);
    else setErro(mensagemErro(res.error.code, res.error.message));
  }

  async function enviar() {
    if (!item || !comprador) return;
    setErro(null);
    setBusy(true);
    const res = await chamar(criarPedido({ itemId: item.id, codigoCarteira: comprador.codigoCarteira }));
    setBusy(false);
    if (res.ok) {
      setPedido(res.data);
      setStatus('pendente');
    } else setErro(mensagemErro(res.error.code, res.error.message));
  }

  async function cancelar() {
    if (!pedido) return;
    setBusy(true);
    await chamar(cancelarPedido({ pedidoId: pedido.pedidoId }));
    setBusy(false);
    setStatus('cancelado');
  }

  async function novaVenda() {
    setItem(null);
    setComprador(null);
    setPedido(null);
    setStatus('pendente');
    setErro(null);
    setReportarAberto(false);
    const res = await chamar(buscarCatalogo({ busca }));
    if (res.ok) setItens(res.data);
  }

  if (pedido) {
    const modal = reportarAberto && (
      <ReportarModal pedidoId={pedido.pedidoId} reportar={reportar} onFechar={() => setReportarAberto(false)} />
    );

    if (status === 'aprovado') {
      const restante = Math.max(0, pedido.compradorSaldo - pedido.valor);
      return (
        <div className={cx('card', styles.resultado)}>
          <div className={cx(styles.iconCircle, styles.iconSuccess)}>
            <Check size={34} weight="bold" />
          </div>
          <div className={styles.resultTitle}>Venda concluída</div>
          <div className={styles.resultSub}>{pedido.itemNome} entregue ao comprador</div>
          <div className={styles.stats}>
            <div className={styles.stat}>
              <div className={styles.statLabel}>Valor debitado</div>
              <div className={cx(styles.statValue, styles.statDebit)}>−{pedido.valor} Fichas</div>
            </div>
            <div className={styles.stat}>
              <div className={styles.statLabel}>Saldo restante</div>
              <div className={cx(styles.statValue, styles.statCredit)}>{restante} Fichas</div>
            </div>
          </div>
          <div className={styles.resultActions}>
            <Button variant="primary" block onClick={novaVenda} autoFocus>
              Nova venda
            </Button>
          </div>
        </div>
      );
    }
    if (status === 'recusado') {
      return (
        <>
          <div className={cx('card', styles.resultado)}>
            <div className={cx(styles.iconCircle, styles.iconError)}>
              <X size={32} weight="bold" />
            </div>
            <div className={styles.resultTitle}>Compra recusada</div>
            <div className={styles.resultSub}>
              {pedido.compradorNome} não concluiu a compra de {pedido.itemNome}.
            </div>
            <div className={styles.resultActions} style={{ marginTop: 26 }}>
              <Button variant="primary" block onClick={novaVenda} autoFocus>
                Nova venda
              </Button>
              <Button variant="ghost" block onClick={() => setReportarAberto(true)}>
                <Flag size={18} weight="bold" /> Reportar comprador
              </Button>
            </div>
          </div>
          {modal}
        </>
      );
    }
    if (status === 'cancelado') {
      return (
        <div className={cx('card', styles.resultado)}>
          <div className={cx(styles.iconCircle, styles.iconNeutral)}>
            <X size={32} weight="bold" />
          </div>
          <div className={styles.resultTitle}>Pedido cancelado</div>
          <div className={styles.resultSub}>O pedido foi cancelado.</div>
          <div className={styles.resultActions} style={{ marginTop: 26 }}>
            <Button variant="primary" block onClick={novaVenda} autoFocus>
              Nova venda
            </Button>
          </div>
        </div>
      );
    }
    return (
      <div className="stack">
        <div className={cx('card', 'center', 'stack', styles.aguardando)}>
          <Hourglass size={52} weight="duotone" color="var(--green-dark)" className={styles.spinSlow} />
          <h2>Aguardando aprovação</h2>
          <p className="muted">
            <b>{pedido.compradorNome}</b> precisa aprovar a compra de <b>{pedido.itemNome}</b> (
            <b className="mono">{pedido.valor}</b> fichas) na carteira.
          </p>
          {!pedido.suficiente && (
            <Alert variant="error">
              Atenção: o saldo do comprador pode ser insuficiente ({pedido.compradorSaldo} fichas).
            </Alert>
          )}
        </div>
        <Button variant="ghost" block onClick={cancelar} disabled={busy}>
          Cancelar pedido
        </Button>
        <Button variant="ghost" block onClick={() => setReportarAberto(true)} disabled={busy}>
          <Flag size={18} weight="bold" /> Reportar comprador
        </Button>
        {modal}
      </div>
    );
  }

  return (
    <div className="stack">
      {!item ? (
        <div className="stack">
          <div className="row-between">
            <h2>Escolha o item</h2>
            <SearchField value={busca} onValueChange={setBusca} placeholder="Pesquisar" ariaLabel="Pesquisar item" />
          </div>
          <CatalogoGrid itens={itens} onEscolher={setItem} vazio="Nenhum item com estoque nesta unidade." />
        </div>
      ) : (
        <div className="card stack-sm">
          <div className="row-between">
            <span className={styles.cat}>Item selecionado</span>
            <Button variant="ghost" onClick={() => setItem(null)} disabled={busy}>
              Trocar
            </Button>
          </div>
          <strong className={styles.nome}>{item.nome}</strong>
          <span className="muted">{item.categoria}</span>
          <span className={styles.valor}>{item.valor} fichas</span>
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
                <Button variant="ghost" onClick={() => setComprador(null)} disabled={busy}>
                  Trocar
                </Button>
              </div>
              <span className="mono muted">{comprador.codigoCarteira}</span>
              <span className="mono">Saldo: {comprador.saldo} fichas</span>
            </div>
          )}
        </>
      )}

      {erro && <Alert variant="error">{erro}</Alert>}

      {item && comprador && (
        <Button variant="primary" size="lg" block onClick={enviar} disabled={busy}>
          {busy ? 'Enviando…' : `Enviar para aprovação · ${item.valor} fichas`}
        </Button>
      )}
    </div>
  );
}
