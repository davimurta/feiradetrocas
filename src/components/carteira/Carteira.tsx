'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { aprovarPedidoAction, recusarPedidoAction } from '@/app/actions/pedido';
import { sincronizarCarteiraAction } from '@/app/actions/carteira';
import { mensagemErro } from '@/lib/mensagens';
import { chamar } from '@/lib/acao';
import { Alert } from '@/components/ui';
import { TransacaoList, type TransacaoItem } from '@/components/TransacaoList';
import type { PedidoPendenteView } from '@/server/queries';
import { CarteiraAcoes } from './CarteiraAcoes';
import { AprovacaoOverlay } from './AprovacaoOverlay';
import styles from './Carteira.module.css';

export function Carteira({
  nome,
  saldo: saldoInicial,
  codigoCarteira,
  historico: historicoInicial,
  pendentes: pendentesIniciais,
}: {
  nome: string;
  saldo: number;
  codigoCarteira: string;
  historico: TransacaoItem[];
  pendentes: PedidoPendenteView[];
}) {
  const [saldo, setSaldo] = useState(saldoInicial);
  const [historico, setHistorico] = useState(historicoInicial);
  const [pendentes, setPendentes] = useState(pendentesIniciais);
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);
  const [busy, setBusy] = useState(false);
  // Enquanto uma aprovação está em voo, o estado local é mais novo que o do servidor;
  // deixar o polling escrever por cima faria o saldo "voltar" por um instante.
  const emAcao = useRef(false);
  const saldoRef = useRef(saldoInicial);
  saldoRef.current = saldo;

  const sincronizar = useCallback(async () => {
    if (emAcao.current) return;
    const r = await chamar(sincronizarCarteiraAction());
    if (!r.ok || emAcao.current) return;

    const ganho = r.data.saldo - saldoRef.current;
    setSaldo(r.data.saldo);
    setHistorico(r.data.historico);
    setPendentes(r.data.pendentes);
    // Crédito veio de fora (a recepção deu push): avisa em vez de mudar o número calado.
    if (ganho > 0) setMsg({ ok: true, texto: `+${ganho} fichas creditadas na sua carteira.` });
  }, []);

  useEffect(() => {
    // Aba em segundo plano não precisa de polling — no dia do evento são centenas de
    // carteiras abertas ao mesmo tempo. Ao voltar o foco, sincroniza na hora.
    let timer: ReturnType<typeof setInterval> | null = null;

    function parar() {
      if (timer) clearInterval(timer);
      timer = null;
    }
    function comecar() {
      parar();
      timer = setInterval(() => void sincronizar(), 4000);
    }
    function aoMudarVisibilidade() {
      if (document.visibilityState === 'visible') {
        void sincronizar();
        comecar();
      } else {
        parar();
      }
    }

    comecar();
    document.addEventListener('visibilitychange', aoMudarVisibilidade);
    window.addEventListener('focus', aoMudarVisibilidade);
    return () => {
      parar();
      document.removeEventListener('visibilitychange', aoMudarVisibilidade);
      window.removeEventListener('focus', aoMudarVisibilidade);
    };
  }, [sincronizar]);

  const atual = pendentes[0] ?? null;
  const primeiroNome = nome.split(' ')[0];

  async function aceitar() {
    if (!atual || busy) return;
    setBusy(true);
    emAcao.current = true;
    setMsg(null);
    const r = await chamar(aprovarPedidoAction({ pedidoId: atual.id }));
    setBusy(false);
    emAcao.current = false;
    if (r.ok) {
      setPendentes((p) => p.filter((x) => x.id !== atual.id));
      setSaldo(r.data.saldoAtual);
      setHistorico((h) => [
        { id: `pedido-${atual.id}`, tipo: 'debito_compra', valor: r.data.valor, quantidade: 1, createdAt: new Date(), itemNome: r.data.itemNome },
        ...h,
      ]);
      setMsg({ ok: true, texto: `Compra aprovada: −${r.data.valor} fichas (${r.data.itemNome}).` });
    } else if (r.error.code === 'REDE') {
      // Falha de rede: mantém o pedido na tela; o polling volta a sincronizar.
      setMsg({ ok: false, texto: mensagemErro(r.error.code) });
    } else {
      setPendentes((p) => p.filter((x) => x.id !== atual.id));
      setMsg({ ok: false, texto: mensagemErro(r.error.code, r.error.message) });
    }
  }

  async function recusar() {
    if (!atual || busy) return;
    setBusy(true);
    emAcao.current = true;
    setMsg(null);
    const r = await chamar(recusarPedidoAction({ pedidoId: atual.id }));
    setBusy(false);
    emAcao.current = false;
    if (r.ok) {
      setPendentes((p) => p.filter((x) => x.id !== atual.id));
      setMsg({ ok: true, texto: 'Compra recusada.' });
    } else if (r.error.code === 'REDE') {
      setMsg({ ok: false, texto: mensagemErro(r.error.code) });
    } else {
      setPendentes((p) => p.filter((x) => x.id !== atual.id));
      setMsg({ ok: false, texto: mensagemErro(r.error.code, r.error.message) });
    }
  }

  return (
    <main className="screen stack">
      <h2 className="page-title">Olá, {primeiroNome}</h2>

      {msg && (
        <Alert variant={msg.ok ? 'success' : 'error'} className={styles.toast}>
          {msg.texto}
        </Alert>
      )}

      {atual && (
        <AprovacaoOverlay pedido={atual} fila={pendentes.length} onAceitar={aceitar} onRecusar={recusar} busy={busy} />
      )}

      <div className={styles.grid}>
        <CarteiraAcoes saldo={saldo} codigoCarteira={codigoCarteira} propostaAberta={atual !== null} />
        <div className="stack">
          <h2>Histórico de compras</h2>
          <TransacaoList itens={historico} vazio="Nenhuma transação ainda." />
        </div>
      </div>
    </main>
  );
}
