'use client';

import { useState } from 'react';
import { Unidade } from '@prisma/client';
import {
  receberItemAction,
  buscarItensPorNomeAction,
  buscarAlunoAction,
  listarPendentesAction,
  pushProducaoAction,
  pushTodosProducaoAction,
  editarPendenteAction,
  alertasPendentesAction,
  type ReceberItemActionResult,
} from '@/app/actions/entrada';
import type { EditarPendenteCampos } from './ItensPendentes';
import { mensagemErro } from '@/lib/mensagens';
import { chamar } from '@/lib/acao';
import { Tabs } from '@/components/ui';
import type { ItemPendenteView, AlertaDiscrepanciaView } from '@/server/queries';
import { AlertasDiscrepancia } from '@/components/alertas/AlertasDiscrepancia';
import { RecepcaoForm } from './RecepcaoForm';
import { ItensPendentes } from './ItensPendentes';

type Aba = 'cadastro' | 'pendentes';

function comoPendente(p: ReceberItemActionResult): ItemPendenteView {
  return {
    id: p.id,
    codigo: p.codigo,
    nome: p.nome,
    categoria: p.categoria,
    valor: p.valor,
    quantidade: p.quantidade,
    unidade: p.unidade,
    descricao: p.descricao,
    alunoNome: p.alunoNome,
    alunoMatricula: p.alunoMatricula,
    createdAt: new Date(),
  };
}

export function EntradaConsole({
  unidadePadrao,
  pendentesIniciais,
  alertasIniciais,
}: {
  unidadePadrao: Unidade;
  pendentesIniciais: ItemPendenteView[];
  alertasIniciais: AlertaDiscrepanciaView[];
}) {
  const [aba, setAba] = useState<Aba>('cadastro');
  const [pendentes, setPendentes] = useState(pendentesIniciais);
  const [alertas, setAlertas] = useState(alertasIniciais);
  const [foco, setFoco] = useState<string | null>(null);
  const [unidade, setUnidade] = useState<Unidade | ''>('');
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [pushingAll, setPushingAll] = useState(false);

  const unidadeFiltro = unidade || undefined;
  const alertasVisiveis = unidade === '' ? alertas : alertas.filter((a) => a.unidade === unidade);

  async function recarregarAlertas() {
    const r = await chamar(alertasPendentesAction());
    if (r.ok) setAlertas(r.data);
  }

  function irParaItem(itemId: string) {
    setAba('pendentes');
    setFoco(itemId);
    // Realce temporário; some sozinho após alguns segundos.
    setTimeout(() => setFoco((atual) => (atual === itemId ? null : atual)), 2600);
  }

  function aoCadastrar(p: ReceberItemActionResult) {
    // Sincroniza a aba de pendentes na hora, sem refetch (respeita o filtro atual).
    if (unidade === '' || p.unidade === unidade) {
      setPendentes((prev) => [comoPendente(p), ...prev]);
    }
    void recarregarAlertas();
  }

  async function trocarUnidade(u: Unidade | '') {
    setUnidade(u);
    const r = await chamar(listarPendentesAction({ unidade: u || undefined }));
    if (r.ok) setPendentes(r.data);
  }

  async function push(id: string) {
    setBusyId(id);
    setMsg(null);
    const r = await chamar(pushProducaoAction({ id }));
    setBusyId(null);
    if (r.ok) {
      setPendentes((prev) => prev.filter((x) => x.id !== id));
      setMsg({ ok: true, texto: `${r.data.item.nome} em produção · +${r.data.creditado} fichas para ${r.data.alunoNome}.` });
      void recarregarAlertas();
    } else {
      setMsg({ ok: false, texto: mensagemErro(r.error.code, r.error.message) });
    }
  }

  async function editar(id: string, campos: EditarPendenteCampos): Promise<boolean> {
    setMsg(null);
    const r = await chamar(editarPendenteAction({ id, ...campos }));
    if (r.ok) {
      setPendentes((prev) => prev.map((x) => (x.id === id ? { ...x, ...r.data } : x)));
      setMsg({ ok: true, texto: `${r.data.nome} atualizado.` });
      void recarregarAlertas();
      return true;
    }
    setMsg({ ok: false, texto: mensagemErro(r.error.code, r.error.message) });
    return false;
  }

  /** `ids` ausente = fila inteira da unidade filtrada; presente = seleção da tela. */
  async function pushLote(ids?: string[]) {
    if (pendentes.length === 0 || (ids && ids.length === 0)) return;
    setPushingAll(true);
    setMsg(null);
    const r = await chamar(pushTodosProducaoAction({ unidade: unidadeFiltro, ids }));
    setPushingAll(false);
    if (r.ok) {
      // A action devolve os ids que realmente entraram: dá para tirar exatamente esses da
      // lista, sem uma segunda ida ao servidor só para redescobrir o que sobrou.
      const enviados = new Set(r.data.idsOk);
      setPendentes((prev) => prev.filter((x) => !enviados.has(x.id)));
      const falhas = r.data.falhas ? ` (${r.data.falhas} falharam)` : '';
      setMsg({ ok: true, texto: `${r.data.total} itens em produção · +${r.data.creditadoTotal} fichas${falhas}.` });
      void recarregarAlertas();
    } else {
      setMsg({ ok: false, texto: mensagemErro(r.error.code, r.error.message) });
    }
  }

  return (
    <div className="stack">
      <AlertasDiscrepancia alertas={alertasVisiveis} onEditar={irParaItem} />

      <Tabs
        value={aba}
        onChange={setAba}
        items={[
          { value: 'cadastro', label: 'Cadastro de itens' },
          { value: 'pendentes', label: 'Itens pendentes', badge: pendentes.length },
        ]}
      />

      {aba === 'cadastro' ? (
        <RecepcaoForm
          unidadePadrao={unidadePadrao}
          receber={receberItemAction}
          buscarItens={buscarItensPorNomeAction}
          buscarAluno={buscarAlunoAction}
          onCadastrado={aoCadastrar}
        />
      ) : (
        <ItensPendentes
          itens={pendentes}
          unidade={unidade}
          onUnidade={trocarUnidade}
          onPush={push}
          onPushTodos={() => pushLote()}
          onPushSelecionados={(ids) => pushLote(ids)}
          onEditar={editar}
          busyId={busyId}
          pushingAll={pushingAll}
          msg={msg}
          foco={foco}
        />
      )}
    </div>
  );
}
