'use client';

import { useEffect, useRef, useState } from 'react';
import { Unidade } from '@prisma/client';
import { editarItemAction, excluirItemAction, listarItensAction } from '@/app/actions/admin';
import { mensagemErro } from '@/lib/mensagens';
import { chamar } from '@/lib/acao';
import { cx } from '@/lib/cx';
import {
  Alert,
  Button,
  SearchField,
  EmptyCard,
  DataRow,
  DataCell,
  RowActions,
  Tooltip,
  DataInput,
  DataSelect,
  DataTextarea,
} from '@/components/ui';
import { useFocoAlerta } from '@/components/alertas/useFocoAlerta';
import type { ItemAdmin } from '@/server/queries';

const CATEGORIAS = ['Livros', 'Roupas', 'Brinquedos', 'Eletrônicos', 'Jogos', 'Papelaria', 'Outros'];
const UNIDADES = Object.values(Unidade);

export function AdminItens({
  initial,
  unidade,
  foco,
  onMutou,
}: {
  initial: ItemAdmin[];
  unidade?: Unidade;
  foco?: string | null;
  onMutou?: () => void;
}) {
  const [itens, setItens] = useState(initial);
  const [busca, setBusca] = useState('');
  const deb = useRef<ReturnType<typeof setTimeout> | null>(null);
  const primeiro = useRef(true);

  useEffect(() => {
    // Os dados iniciais já vêm do servidor; só refazemos a busca quando algo muda.
    if (primeiro.current) {
      primeiro.current = false;
      return;
    }
    if (deb.current) clearTimeout(deb.current);
    deb.current = setTimeout(async () => {
      const r = await chamar(listarItensAction({ busca, unidade }));
      if (r.ok) setItens(r.data);
    }, 250);
    return () => {
      if (deb.current) clearTimeout(deb.current);
    };
  }, [busca, unidade]);

  return (
    <div className="stack">
      <SearchField value={busca} onValueChange={setBusca} placeholder="Buscar item…" ariaLabel="Buscar item" />
      {itens.length === 0 ? (
        <EmptyCard>Nenhum item.</EmptyCard>
      ) : (
        itens.map((it) => (
          <ItemRow
            key={it.id}
            item={it}
            focado={foco === it.id}
            onSalvo={(u) => setItens((prev) => prev.map((x) => (x.id === u.id ? u : x)))}
            onExcluido={(id) => setItens((prev) => prev.filter((x) => x.id !== id))}
            onMutou={onMutou}
          />
        ))
      )}
    </div>
  );
}

function ItemRow({
  item,
  focado = false,
  onSalvo,
  onExcluido,
  onMutou,
}: {
  item: ItemAdmin;
  focado?: boolean;
  onSalvo: (item: ItemAdmin) => void;
  onExcluido: (id: string) => void;
  onMutou?: () => void;
}) {
  const { ref, classe } = useFocoAlerta<HTMLDivElement>(focado);
  const [nome, setNome] = useState(item.nome);
  const [categoria, setCategoria] = useState(item.categoria);
  const [valor, setValor] = useState(String(item.valor));
  const [quantidade, setQuantidade] = useState(String(item.quantidade));
  const [unidade, setUnidade] = useState<Unidade>(item.unidade);
  const [descricao, setDescricao] = useState(item.descricao ?? '');
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const dirty =
    nome !== item.nome ||
    categoria !== item.categoria ||
    Number(valor) !== item.valor ||
    Number(quantidade) !== item.quantidade ||
    unidade !== item.unidade ||
    descricao !== (item.descricao ?? '');

  async function salvar() {
    setMsg(null);
    setBusy(true);
    const r = await chamar(editarItemAction({
      id: item.id,
      nome: nome.trim(),
      categoria,
      valor: Number(valor),
      quantidade: Number(quantidade),
      descricao: descricao.trim() || undefined,
      unidade,
    }));
    setBusy(false);
    if (r.ok) {
      onSalvo(r.data);
      onMutou?.();
    } else setMsg(mensagemErro(r.error.code, r.error.message));
  }

  async function excluir() {
    if (!window.confirm(`Excluir "${item.nome}"?`)) return;
    setMsg(null);
    setBusy(true);
    const r = await chamar(excluirItemAction({ id: item.id }));
    setBusy(false);
    if (r.ok) {
      onExcluido(item.id);
      onMutou?.();
    } else setMsg(mensagemErro(r.error.code, r.error.message));
  }

  return (
    <div ref={ref} className={cx('stack-sm', classe)}>
      <DataRow>
        <DataCell label="Nome" span={2}>
          <DataInput value={nome} onChange={(e) => setNome(e.target.value)} disabled={busy} />
        </DataCell>
        <DataCell label="Categoria">
          <DataSelect value={categoria} onChange={(e) => setCategoria(e.target.value)} disabled={busy}>
            {[categoria, ...CATEGORIAS.filter((c) => c !== categoria)].map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </DataSelect>
        </DataCell>
        <DataCell label="Valor">
          <DataInput mono type="number" min={1} value={valor} onChange={(e) => setValor(e.target.value)} disabled={busy} />
        </DataCell>
        <DataCell label="Estoque">
          <DataInput mono type="number" min={0} value={quantidade} onChange={(e) => setQuantidade(e.target.value)} disabled={busy} />
        </DataCell>
        <DataCell label="Unidade">
          <DataSelect value={unidade} onChange={(e) => setUnidade(e.target.value as Unidade)} disabled={busy}>
            {UNIDADES.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </DataSelect>
        </DataCell>
        <DataCell label="Descrição" span="full">
          <DataTextarea value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="Sem descrição" rows={2} maxLength={500} disabled={busy} />
        </DataCell>
        <RowActions>
          <Tooltip className="push-left" items={[{ label: 'Código', value: item.codigo }]} />
          <Button variant="primary" size="sm" onClick={salvar} disabled={busy || !dirty}>
            Salvar
          </Button>
          <Button variant="dangerOutline" size="sm" onClick={excluir} disabled={busy}>
            Excluir
          </Button>
        </RowActions>
      </DataRow>
      {msg && <Alert variant="error">{msg}</Alert>}
    </div>
  );
}
