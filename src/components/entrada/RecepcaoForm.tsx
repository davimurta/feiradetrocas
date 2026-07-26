'use client';

import { useEffect, useRef, useState } from 'react';
import { Unidade } from '@prisma/client';
import type { ActionResult } from '@/app/actions/_result';
import type { ReceberItemActionResult } from '@/app/actions/entrada';
import type { ProdutoView, AlunoView } from '@/server/queries';
import { mensagemErro } from '@/lib/mensagens';

const CATEGORIAS = ['Livros', 'Roupas', 'Brinquedos', 'Eletrônicos', 'Jogos', 'Papelaria', 'Outros'];
const UNIDADES = Object.values(Unidade);

export function RecepcaoForm({
  unidadePadrao,
  receber,
  buscarItens,
  buscarAluno,
}: {
  /** Unidade sugerida (a do atendente); a recepção pode trocar por item. */
  unidadePadrao: Unidade;
  receber: (input: {
    matricula: string;
    nome: string;
    categoria: string;
    valor: number;
    unidade: Unidade;
  }) => Promise<ActionResult<ReceberItemActionResult>>;
  buscarItens: (input: { nome: string; unidade: Unidade }) => Promise<ActionResult<ProdutoView[]>>;
  buscarAluno: (input: { identificador: string }) => Promise<ActionResult<AlunoView | null>>;
}) {
  const [nome, setNome] = useState('');
  const [categoria, setCategoria] = useState('Livros');
  const [unidade, setUnidade] = useState<Unidade>(unidadePadrao);
  const [matricula, setMatricula] = useState('');
  const [valor, setValor] = useState('');

  const [sugestoes, setSugestoes] = useState<ProdutoView[]>([]);
  const [mostrarSug, setMostrarSug] = useState(false);
  const [aluno, setAluno] = useState<AlunoView | null>(null);
  const [alunoBuscado, setAlunoBuscado] = useState(false);

  const [erro, setErro] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState<ReceberItemActionResult | null>(null);
  const [loading, setLoading] = useState(false);

  const debItem = useRef<ReturnType<typeof setTimeout> | null>(null);
  const debAluno = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debItem.current) clearTimeout(debItem.current);
    if (nome.trim().length < 2) {
      setSugestoes([]);
      return;
    }
    debItem.current = setTimeout(async () => {
      const res = await buscarItens({ nome: nome.trim(), unidade });
      if (res.ok) setSugestoes(res.data);
    }, 250);
    return () => {
      if (debItem.current) clearTimeout(debItem.current);
    };
  }, [nome, unidade, buscarItens]);

  useEffect(() => {
    if (debAluno.current) clearTimeout(debAluno.current);
    setAluno(null);
    setAlunoBuscado(false);
    if (matricula.trim().length < 3) return;
    debAluno.current = setTimeout(async () => {
      const res = await buscarAluno({ identificador: matricula.trim() });
      if (res.ok) {
        setAluno(res.data);
        setAlunoBuscado(true);
      }
    }, 350);
    return () => {
      if (debAluno.current) clearTimeout(debAluno.current);
    };
  }, [matricula, buscarAluno]);

  function escolherSugestao(p: ProdutoView) {
    setNome(p.nome);
    setCategoria(p.categoria);
    setValor(String(p.valor));
    setMostrarSug(false);
    setSugestoes([]);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    setSucesso(null);
    const n = Number(valor);
    if (!matricula.trim()) return setErro('Informe a matrícula do aluno.');
    if (!nome.trim()) return setErro('Informe o nome do item.');
    if (!Number.isInteger(n) || n <= 0) return setErro('Informe um valor inteiro de fichas (maior que zero).');

    setLoading(true);
    const res = await receber({ matricula: matricula.trim(), nome: nome.trim(), categoria, valor: n, unidade });
    setLoading(false);

    if (res.ok) {
      setSucesso(res.data);
      setNome('');
      setValor('');
      setSugestoes([]);
    } else {
      setErro(mensagemErro(res.error.code, res.error.message));
    }
  }

  return (
    <form className="stack" onSubmit={submit}>
      {sucesso && (
        <div className="alert alert--success" role="status">
          <b>{sucesso.item.nome}</b> registrado ({sucesso.novo ? 'novo item' : `estoque ${sucesso.item.quantidade}`}).
          Creditado <b>{sucesso.creditado}</b> fichas para <b>{sucesso.alunoNome}</b>
          {sucesso.alunoCriado ? ' (conta criada)' : ''}. Código <span className="mono">{sucesso.item.codigo}</span>.
        </div>
      )}

      <div className="form-grid">
        <div className="field autocomplete">
          <label htmlFor="nome">Nome do item:</label>
          <input
            id="nome"
            className="input"
            value={nome}
            onChange={(e) => {
              setNome(e.target.value);
              setMostrarSug(true);
            }}
            onFocus={() => setMostrarSug(true)}
            onBlur={() => setTimeout(() => setMostrarSug(false), 150)}
            placeholder="Ex.: Livro de matemática"
            autoComplete="off"
            disabled={loading}
          />
          {mostrarSug && sugestoes.length > 0 && (
            <div className="suggestions">
              {sugestoes.map((p) => (
                <button key={p.id} type="button" onMouseDown={() => escolherSugestao(p)}>
                  <span>
                    {p.nome} <span className="muted">· {p.categoria}</span>
                  </span>
                  <span className="v">{p.valor} fichas</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="field">
          <label htmlFor="categoria">Categoria:</label>
          <select
            id="categoria"
            className="select"
            value={categoria}
            onChange={(e) => setCategoria(e.target.value)}
            disabled={loading}
          >
            {CATEGORIAS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label htmlFor="unidade">Unidade do item:</label>
          <select
            id="unidade"
            className="select"
            value={unidade}
            onChange={(e) => setUnidade(e.target.value as Unidade)}
            disabled={loading}
          >
            {UNIDADES.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label htmlFor="matricula">Matrícula do aluno:</label>
          <input
            id="matricula"
            className="input mono"
            value={matricula}
            onChange={(e) => setMatricula(e.target.value)}
            placeholder="99999999"
            autoComplete="off"
            disabled={loading}
          />
          {alunoBuscado && (
            <span className="muted" style={{ fontSize: '0.82rem' }}>
              {aluno ? `Aluno: ${aluno.nome} (saldo ${aluno.saldo})` : 'Novo aluno — conta será criada.'}
            </span>
          )}
        </div>

        <div className="field">
          <label htmlFor="valor">Valor do Item:</label>
          <input
            id="valor"
            className="input mono"
            type="number"
            min={1}
            step={1}
            inputMode="numeric"
            value={valor}
            onChange={(e) => setValor(e.target.value)}
            placeholder="10"
            disabled={loading}
          />
        </div>
      </div>

      {erro && (
        <div className="alert alert--error" role="alert">
          {erro}
        </div>
      )}

      <div>
        <button type="submit" className="btn btn--primary" disabled={loading}>
          {loading ? 'Cadastrando…' : 'Cadastrar'}
        </button>
      </div>
    </form>
  );
}
