'use client';

import { useEffect, useRef, useState } from 'react';
import { Unidade } from '@prisma/client';
import { editarItemAction, excluirItemAction, listarItensAction } from '@/app/actions/admin';
import { mensagemErro } from '@/lib/mensagens';
import type { ItemAdmin } from '@/server/queries';

const CATEGORIAS = ['Livros', 'Roupas', 'Brinquedos', 'Eletrônicos', 'Jogos', 'Papelaria', 'Outros'];
const UNIDADES = Object.values(Unidade);

export function AdminItens({ initial, unidade }: { initial: ItemAdmin[]; unidade?: Unidade }) {
  const [itens, setItens] = useState(initial);
  const [busca, setBusca] = useState('');
  const deb = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function recarregar(q = busca) {
    const r = await listarItensAction({ busca: q, unidade });
    if (r.ok) setItens(r.data);
  }

  useEffect(() => {
    if (deb.current) clearTimeout(deb.current);
    deb.current = setTimeout(() => recarregar(busca), 250);
    return () => {
      if (deb.current) clearTimeout(deb.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busca, unidade]);

  return (
    <div className="stack">
      <div className="search">
        <input
          className="input"
          placeholder="Buscar item…"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          aria-label="Buscar item"
        />
      </div>
      {itens.length === 0 ? (
        <div className="card center muted">Nenhum item.</div>
      ) : (
        itens.map((it) => <ItemRow key={it.id} item={it} onChanged={() => recarregar()} />)
      )}
    </div>
  );
}

function ItemRow({ item, onChanged }: { item: ItemAdmin; onChanged: () => void }) {
  const [nome, setNome] = useState(item.nome);
  const [categoria, setCategoria] = useState(item.categoria);
  const [valor, setValor] = useState(String(item.valor));
  const [quantidade, setQuantidade] = useState(String(item.quantidade));
  const [unidade, setUnidade] = useState<Unidade>(item.unidade);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const dirty =
    nome !== item.nome ||
    categoria !== item.categoria ||
    Number(valor) !== item.valor ||
    Number(quantidade) !== item.quantidade ||
    unidade !== item.unidade;

  async function salvar() {
    setMsg(null);
    setBusy(true);
    const r = await editarItemAction({
      id: item.id,
      nome: nome.trim(),
      categoria,
      valor: Number(valor),
      quantidade: Number(quantidade),
      unidade,
    });
    setBusy(false);
    if (r.ok) onChanged();
    else setMsg(mensagemErro(r.error.code, r.error.message));
  }

  async function excluir() {
    if (!window.confirm(`Excluir "${item.nome}"?`)) return;
    setMsg(null);
    setBusy(true);
    const r = await excluirItemAction({ id: item.id });
    setBusy(false);
    if (r.ok) onChanged();
    else setMsg(mensagemErro(r.error.code, r.error.message));
  }

  return (
    <div className="stack-sm">
      <div className="edit-row">
        <div className="field-sm" style={{ gridColumn: 'span 2' }}>
          <label>Nome</label>
          <input className="input" value={nome} onChange={(e) => setNome(e.target.value)} disabled={busy} />
        </div>
        <div className="field-sm">
          <label>Categoria</label>
          <select className="select" value={categoria} onChange={(e) => setCategoria(e.target.value)} disabled={busy}>
            {[categoria, ...CATEGORIAS.filter((c) => c !== categoria)].map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <div className="field-sm">
          <label>Valor</label>
          <input className="input mono" type="number" min={1} value={valor} onChange={(e) => setValor(e.target.value)} disabled={busy} />
        </div>
        <div className="field-sm">
          <label>Estoque</label>
          <input className="input mono" type="number" min={0} value={quantidade} onChange={(e) => setQuantidade(e.target.value)} disabled={busy} />
        </div>
        <div className="field-sm">
          <label>Unidade</label>
          <select className="select" value={unidade} onChange={(e) => setUnidade(e.target.value as Unidade)} disabled={busy}>
            {UNIDADES.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </select>
        </div>
        <div className="field-sm">
          <label>Código</label>
          <span className="ro">{item.codigo}</span>
        </div>
        <div className="row-actions">
          <button className="btn btn--primary btn-sm" onClick={salvar} disabled={busy || !dirty}>
            Salvar
          </button>
          <button className="btn btn--ghost btn-sm" onClick={excluir} disabled={busy}>
            Excluir
          </button>
        </div>
      </div>
      {msg && (
        <div className="alert alert--error" role="alert">
          {msg}
        </div>
      )}
    </div>
  );
}
