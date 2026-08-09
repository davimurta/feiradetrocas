'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Unidade } from '@prisma/client';
import {
  RocketLaunch,
  FloppyDisk,
  PencilSimple,
  X,
  MagnifyingGlass,
  Package,
} from '@phosphor-icons/react/dist/ssr';
import { cx } from '@/lib/cx';
import { formatarDataHora, tempoRelativo } from '@/lib/formato';
import { sanitizeText, LIMITE_TEXTO, LIMITE_TEXTO_LONGO } from '@/lib/sanitize';
import { useFocoAlerta } from '@/components/alertas/useFocoAlerta';
import { Alert, Button, EmptyCard, SelectField } from '@/components/ui';
import type { ItemPendenteView } from '@/server/queries';
import styles from './ItensPendentes.module.css';

const UNIDADES = Object.values(Unidade);
const CATEGORIAS = ['Livros', 'Roupas', 'Brinquedos', 'Eletrônicos', 'Jogos', 'Papelaria', 'Outros'];

const ORDENS = {
  recentes: 'Mais recentes',
  antigos: 'Mais antigos (fila)',
  aluno: 'Aluno (A–Z)',
  valor: 'Maior valor',
} as const;
type Ordem = keyof typeof ORDENS;

export type EditarPendenteCampos = {
  nome: string;
  categoria: string;
  valor: number;
  quantidade: number;
  unidade: Unidade;
  descricao?: string;
};
type OnEditar = (id: string, campos: EditarPendenteCampos) => Promise<boolean>;

const total = (it: ItemPendenteView) => it.valor * it.quantidade;

/**
 * Fila da recepção.
 *
 * Leitura primeiro, edição sob demanda: a versão anterior montava seis campos editáveis
 * por item, o que deixava a tela ilegível justamente quando ela mais importa (fila cheia)
 * e escondia a informação que a recepção realmente confere — de quem é o item. Aqui a
 * linha mostra item + aluno + fichas, e só vira formulário quando alguém pede.
 */
export function ItensPendentes({
  itens,
  unidade,
  onUnidade,
  onPush,
  onPushTodos,
  onPushSelecionados,
  onEditar,
  busyId,
  pushingAll,
  msg,
  foco,
}: {
  itens: ItemPendenteView[];
  unidade: Unidade | '';
  onUnidade: (unidade: Unidade | '') => void;
  onPush: (id: string) => void;
  onPushTodos: () => void;
  onPushSelecionados?: (ids: string[]) => void;
  onEditar: OnEditar;
  busyId: string | null;
  pushingAll: boolean;
  msg: { ok: boolean; texto: string } | null;
  foco?: string | null;
}) {
  const [busca, setBusca] = useState('');
  const [ordem, setOrdem] = useState<Ordem>('antigos');
  const [selecao, setSelecao] = useState<Set<string>>(new Set());
  const [editando, setEditando] = useState<string | null>(null);

  const ocupado = pushingAll || busyId !== null;

  // Item removido da lista (push/filtro) não pode continuar selecionado nem em edição.
  useEffect(() => {
    const vivos = new Set(itens.map((i) => i.id));
    setSelecao((prev) => {
      const proxima = new Set([...prev].filter((id) => vivos.has(id)));
      return proxima.size === prev.size ? prev : proxima;
    });
    setEditando((atual) => (atual && vivos.has(atual) ? atual : null));
  }, [itens]);

  useEffect(() => {
    if (foco) {
      setBusca('');
      setEditando(foco);
    }
  }, [foco]);

  const visiveis = useMemo(() => {
    const q = busca.trim().toLowerCase();
    const filtrados = q
      ? itens.filter((i) =>
          [i.nome, i.alunoNome, i.alunoMatricula, i.codigo, i.categoria].some((campo) =>
            campo.toLowerCase().includes(q),
          ),
        )
      : itens;

    const ordenado = [...filtrados];
    switch (ordem) {
      case 'recentes':
        ordenado.sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
        break;
      case 'antigos':
        ordenado.sort((a, b) => +new Date(a.createdAt) - +new Date(b.createdAt));
        break;
      case 'aluno':
        ordenado.sort((a, b) => a.alunoNome.localeCompare(b.alunoNome, 'pt-BR'));
        break;
      case 'valor':
        ordenado.sort((a, b) => total(b) - total(a));
        break;
    }
    return ordenado;
  }, [itens, busca, ordem]);

  const resumo = useMemo(
    () => ({
      itens: itens.length,
      fichas: itens.reduce((s, i) => s + total(i), 0),
      alunos: new Set(itens.map((i) => i.alunoMatricula)).size,
    }),
    [itens],
  );

  const idsVisiveis = visiveis.map((i) => i.id);
  const selecionadosVisiveis = idsVisiveis.filter((id) => selecao.has(id));
  const todosMarcados = idsVisiveis.length > 0 && selecionadosVisiveis.length === idsVisiveis.length;
  const fichasSelecionadas = visiveis
    .filter((i) => selecao.has(i.id))
    .reduce((s, i) => s + total(i), 0);

  function alternar(id: string) {
    setSelecao((prev) => {
      const proxima = new Set(prev);
      if (proxima.has(id)) proxima.delete(id);
      else proxima.add(id);
      return proxima;
    });
  }

  function alternarTodos() {
    setSelecao((prev) => {
      const proxima = new Set(prev);
      if (todosMarcados) idsVisiveis.forEach((id) => proxima.delete(id));
      else idsVisiveis.forEach((id) => proxima.add(id));
      return proxima;
    });
  }

  return (
    <section className="stack" data-testid="itens-pendentes">
      <div className={styles.resumo}>
        <Metrica valor={resumo.itens} rotulo="Itens na fila" />
        <Metrica valor={resumo.fichas} rotulo="Fichas a creditar" destaque />
        <Metrica valor={resumo.alunos} rotulo="Alunos aguardando" />
      </div>

      <div className={styles.barra}>
        <div className={styles.campoBusca}>
          <MagnifyingGlass size={17} weight="bold" aria-hidden />
          <input
            type="search"
            value={busca}
            onChange={(e) => setBusca(sanitizeText(e.target.value, { maxLength: 80 }))}
            placeholder="Filtrar por item, aluno, matrícula ou código…"
            aria-label="Filtrar itens pendentes"
          />
        </div>

        <SelectField
          containerClassName={styles.campoUnidade}
          label="Unidade"
          value={unidade}
          onChange={(e) => onUnidade(e.target.value as Unidade | '')}
        >
          <option value="">Ambas as unidades</option>
          {UNIDADES.map((u) => (
            <option key={u} value={u}>
              {u}
            </option>
          ))}
        </SelectField>

        <SelectField
          containerClassName={styles.campoCurto}
          label="Ordenar por"
          value={ordem}
          onChange={(e) => setOrdem(e.target.value as Ordem)}
        >
          {Object.entries(ORDENS).map(([valor, rotulo]) => (
            <option key={valor} value={valor}>
              {rotulo}
            </option>
          ))}
        </SelectField>

        <Button
          className={styles.pushTodos}
          variant="primary"
          onClick={onPushTodos}
          disabled={ocupado || itens.length === 0}
        >
          <RocketLaunch size={18} weight="bold" />
          {pushingAll ? 'Enviando…' : 'Produzir tudo'}
        </Button>
      </div>

      {msg && <Alert variant={msg.ok ? 'success' : 'error'}>{msg.texto}</Alert>}

      {itens.length === 0 ? (
        <EmptyCard>
          <span className={styles.vazio}>
            <Package size={30} weight="light" aria-hidden />
            Fila vazia. Os itens cadastrados na recepção aparecem aqui até irem para produção.
          </span>
        </EmptyCard>
      ) : visiveis.length === 0 ? (
        <EmptyCard>Nenhum item corresponde a “{busca}”.</EmptyCard>
      ) : (
        <>
          {selecionadosVisiveis.length > 0 && (
            <div className={styles.selecaoBarra} role="region" aria-label="Ações da seleção">
              <span>
                <strong>{selecionadosVisiveis.length}</strong> selecionado
                {selecionadosVisiveis.length > 1 ? 's' : ''} · {fichasSelecionadas} fichas
              </span>
              <div className={styles.selecaoAcoes}>
                <Button variant="ghost" size="sm" onClick={() => setSelecao(new Set())}>
                  Limpar seleção
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  disabled={ocupado || !onPushSelecionados}
                  onClick={() => onPushSelecionados?.(selecionadosVisiveis)}
                >
                  <RocketLaunch size={16} weight="bold" />
                  Produzir selecionados
                </Button>
              </div>
            </div>
          )}

          <div className={styles.tabelaWrap}>
            <table className={styles.tabela}>
              <caption className={styles.caption}>
                Itens recebidos aguardando produção. Produzir credita as fichas ao aluno e
                publica o item no catálogo.
              </caption>
              <thead>
                <tr>
                  <th scope="col" className={styles.colSel}>
                    <input
                      type="checkbox"
                      checked={todosMarcados}
                      onChange={alternarTodos}
                      aria-label="Selecionar todos os itens visíveis"
                    />
                  </th>
                  <th scope="col">Item</th>
                  <th scope="col">Aluno</th>
                  <th scope="col">Categoria</th>
                  <th scope="col" className={styles.num}>
                    Fichas
                  </th>
                  <th scope="col" className={styles.num}>
                    Qtd
                  </th>
                  <th scope="col" className={styles.num}>
                    Total
                  </th>
                  <th scope="col">Unidade</th>
                  <th scope="col">Recebido</th>
                  <th scope="col" className={styles.colAcoes}>
                    Ações
                  </th>
                </tr>
              </thead>
              <tbody>
                {visiveis.map((it) => (
                  <LinhaPendente
                    key={it.id}
                    item={it}
                    selecionado={selecao.has(it.id)}
                    onSelecionar={() => alternar(it.id)}
                    editando={editando === it.id}
                    onEditando={(ligado) => setEditando(ligado ? it.id : null)}
                    onPush={onPush}
                    onEditar={onEditar}
                    busy={busyId === it.id}
                    disabled={ocupado}
                    focado={foco === it.id}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}

function Metrica({ valor, rotulo, destaque }: { valor: number; rotulo: string; destaque?: boolean }) {
  return (
    <div className={cx(styles.metrica, destaque && styles.metricaDestaque)}>
      <span className={styles.metricaValor}>{valor}</span>
      <span className={styles.metricaRotulo}>{rotulo}</span>
    </div>
  );
}

function LinhaPendente({
  item,
  selecionado,
  onSelecionar,
  editando,
  onEditando,
  onPush,
  onEditar,
  busy,
  disabled,
  focado,
}: {
  item: ItemPendenteView;
  selecionado: boolean;
  onSelecionar: () => void;
  editando: boolean;
  onEditando: (ligado: boolean) => void;
  onPush: (id: string) => void;
  onEditar: OnEditar;
  busy: boolean;
  disabled: boolean;
  focado: boolean;
}) {
  const { ref, classe } = useFocoAlerta<HTMLTableRowElement>(focado);

  if (editando) {
    return (
      <LinhaEdicao
        ref={ref}
        classeFoco={classe}
        item={item}
        onEditar={onEditar}
        onFechar={() => onEditando(false)}
        busy={busy}
      />
    );
  }

  return (
    <tr
      ref={ref}
      className={cx(styles.linha, selecionado && styles.linhaSelecionada, classe)}
      data-testid="pendente-linha"
    >
      <td className={styles.colSel} data-rotulo="Selecionar">
        <input
          type="checkbox"
          checked={selecionado}
          onChange={onSelecionar}
          aria-label={`Selecionar ${item.nome}`}
        />
      </td>
      <td data-rotulo="Item">
        <span className={styles.itemNome}>{item.nome}</span>
        <span className={styles.itemSub}>
          <span className="mono">{item.codigo}</span>
          {item.descricao && <> · {item.descricao}</>}
        </span>
      </td>
      <td data-rotulo="Aluno">
        <span className={styles.alunoNome}>{item.alunoNome}</span>
        <span className={cx(styles.itemSub, 'mono')}>{item.alunoMatricula}</span>
      </td>
      <td data-rotulo="Categoria">
        <span className={styles.categoria}>{item.categoria}</span>
      </td>
      <td data-rotulo="Fichas" className={styles.num}>
        {item.valor}
      </td>
      <td data-rotulo="Qtd" className={styles.num}>
        {item.quantidade}
      </td>
      <td data-rotulo="Total" className={cx(styles.num, styles.totalFichas)}>
        {total(item)}
      </td>
      <td data-rotulo="Unidade" className={styles.unidade}>
        {item.unidade}
      </td>
      <td data-rotulo="Recebido" className={styles.quando} title={formatarDataHora(item.createdAt)}>
        {tempoRelativo(item.createdAt)}
      </td>
      <td className={styles.colAcoes}>
        <div className={styles.acoes}>
          <Button variant="ghost" size="sm" onClick={() => onEditando(true)} disabled={busy}>
            <PencilSimple size={15} weight="bold" />
            <span className={styles.rotuloBotao}>Editar</span>
          </Button>
          <Button variant="primary" size="sm" onClick={() => onPush(item.id)} disabled={disabled || busy}>
            <RocketLaunch size={15} weight="bold" />
            <span className={styles.rotuloBotao}>{busy ? 'Enviando…' : 'Produzir'}</span>
          </Button>
        </div>
      </td>
    </tr>
  );
}

/** Linha em modo formulário: ocupa a largura toda para os campos respirarem. */
function LinhaEdicao({
  ref,
  classeFoco,
  item,
  onEditar,
  onFechar,
  busy,
}: {
  ref: React.Ref<HTMLTableRowElement>;
  classeFoco?: string;
  item: ItemPendenteView;
  onEditar: OnEditar;
  onFechar: () => void;
  busy: boolean;
}) {
  const [nome, setNome] = useState(item.nome);
  const [categoria, setCategoria] = useState(item.categoria);
  const [valor, setValor] = useState(String(item.valor));
  const [quantidade, setQuantidade] = useState(String(item.quantidade));
  const [unidade, setUnidade] = useState<Unidade>(item.unidade);
  const [descricao, setDescricao] = useState(item.descricao ?? '');
  const [salvando, setSalvando] = useState(false);
  const primeiroCampo = useRef<HTMLInputElement>(null);

  useEffect(() => primeiroCampo.current?.focus(), []);

  const ocupado = busy || salvando;
  const dirty =
    nome !== item.nome ||
    categoria !== item.categoria ||
    Number(valor) !== item.valor ||
    Number(quantidade) !== item.quantidade ||
    unidade !== item.unidade ||
    descricao !== (item.descricao ?? '');
  const valido = nome.trim().length > 0 && Number(valor) > 0 && Number(quantidade) > 0;

  async function salvar() {
    if (!dirty || !valido) return;
    setSalvando(true);
    const ok = await onEditar(item.id, {
      nome: nome.trim(),
      categoria,
      valor: Number(valor),
      quantidade: Number(quantidade),
      unidade,
      descricao: descricao.trim() || undefined,
    });
    setSalvando(false);
    if (ok) onFechar();
  }

  // Enter salva, Esc fecha — a recepção edita muitos itens seguidos, tirar a mão do
  // teclado a cada linha custa caro na fila.
  function aoTeclar(e: React.KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault();
      onFechar();
    }
    if (e.key === 'Enter' && !(e.target instanceof HTMLTextAreaElement)) {
      e.preventDefault();
      void salvar();
    }
  }

  return (
    <tr ref={ref} className={cx(styles.linhaEdicao, classeFoco)} data-testid="pendente-edicao">
      <td colSpan={10}>
        <div className={styles.formulario} onKeyDown={aoTeclar}>
          <div className={styles.formTopo}>
            <span className={styles.formTitulo}>
              Editando <span className="mono">{item.codigo}</span> · {item.alunoNome} (
              <span className="mono">{item.alunoMatricula}</span>)
            </span>
            <button type="button" className={styles.fechar} onClick={onFechar} aria-label="Cancelar edição">
              <X size={16} weight="bold" />
            </button>
          </div>

          <div className={styles.formGrid}>
            <label className={cx(styles.campo, styles.campoNome)}>
              <span>Nome do item</span>
              <input
                ref={primeiroCampo}
                value={nome}
                maxLength={120}
                onChange={(e) => setNome(sanitizeText(e.target.value, { maxLength: LIMITE_TEXTO }))}
                disabled={ocupado}
              />
            </label>

            <label className={styles.campo}>
              <span>Categoria</span>
              <select value={categoria} onChange={(e) => setCategoria(e.target.value)} disabled={ocupado}>
                {[categoria, ...CATEGORIAS.filter((c) => c !== categoria)].map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>

            <label className={styles.campo}>
              <span>Fichas</span>
              <input
                type="number"
                min={1}
                className="mono"
                value={valor}
                onChange={(e) => setValor(e.target.value)}
                disabled={ocupado}
              />
            </label>

            <label className={styles.campo}>
              <span>Quantidade</span>
              <input
                type="number"
                min={1}
                className="mono"
                value={quantidade}
                onChange={(e) => setQuantidade(e.target.value)}
                disabled={ocupado}
              />
            </label>

            <label className={styles.campo}>
              <span>Unidade</span>
              <select
                value={unidade}
                onChange={(e) => setUnidade(e.target.value as Unidade)}
                disabled={ocupado}
              >
                {UNIDADES.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </select>
            </label>

            <label className={cx(styles.campo, styles.campoDescricao)}>
              <span>Descrição</span>
              <textarea
                value={descricao}
                maxLength={500}
                rows={2}
                placeholder="Estado do item, detalhes, observações…"
                onChange={(e) =>
                  setDescricao(sanitizeText(e.target.value, { maxLength: LIMITE_TEXTO_LONGO, multiline: true }))
                }
                disabled={ocupado}
              />
            </label>
          </div>

          <div className={styles.formAcoes}>
            <span className={styles.formTotal}>
              Total: <strong>{(Number(valor) || 0) * (Number(quantidade) || 0)}</strong> fichas
            </span>
            <Button variant="ghost" size="sm" onClick={onFechar} disabled={ocupado}>
              Cancelar
            </Button>
            <Button variant="primary" size="sm" onClick={salvar} disabled={ocupado || !dirty || !valido}>
              <FloppyDisk size={15} weight="bold" />
              {salvando ? 'Salvando…' : 'Salvar'}
            </Button>
          </div>
        </div>
      </td>
    </tr>
  );
}
