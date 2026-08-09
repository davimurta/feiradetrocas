'use client';

import { useEffect, useRef, useState } from 'react';
import { Unidade } from '@prisma/client';
import type { ActionResult } from '@/app/actions/_result';
import type { ReceberItemActionResult } from '@/app/actions/entrada';
import type { ProdutoView, AlunoView } from '@/server/queries';
import { cx } from '@/lib/cx';
import { mensagemErro } from '@/lib/mensagens';
import { chamar } from '@/lib/acao';
import { Alert, Button, TextInput, SelectField, TextareaField } from '@/components/ui';
import styles from './RecepcaoForm.module.css';

const CATEGORIAS = ['Livros', 'Roupas', 'Brinquedos', 'Eletrônicos', 'Jogos', 'Papelaria', 'Outros'];
const UNIDADES = Object.values(Unidade);

export function RecepcaoForm({
  unidadePadrao,
  receber,
  buscarItens,
  buscarAluno,
  onCadastrado,
}: {
  unidadePadrao: Unidade;
  receber: (input: {
    matricula: string;
    nome: string;
    categoria: string;
    valor: number;
    descricao?: string;
    unidade: Unidade;
  }) => Promise<ActionResult<ReceberItemActionResult>>;
  buscarItens: (input: { nome: string; unidade: Unidade }) => Promise<ActionResult<ProdutoView[]>>;
  buscarAluno: (input: { identificador: string }) => Promise<ActionResult<AlunoView | null>>;
  onCadastrado?: (pendente: ReceberItemActionResult) => void;
}) {
  const [nome, setNome] = useState('');
  const [categoria, setCategoria] = useState('Livros');
  const [unidade, setUnidade] = useState<Unidade>(unidadePadrao);
  const [matricula, setMatricula] = useState('');
  const [valor, setValor] = useState('');
  const [descricao, setDescricao] = useState('');

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
      const res = await chamar(buscarItens({ nome: nome.trim(), unidade }));
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
      const res = await chamar(buscarAluno({ identificador: matricula.trim() }));
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
    const res = await chamar(receber({
      matricula: matricula.trim(),
      nome: nome.trim(),
      categoria,
      valor: n,
      descricao: descricao.trim() || undefined,
      unidade,
    }));
    setLoading(false);

    if (res.ok) {
      setSucesso(res.data);
      setNome('');
      setValor('');
      setDescricao('');
      setSugestoes([]);
      onCadastrado?.(res.data);
    } else {
      setErro(mensagemErro(res.error.code, res.error.message));
    }
  }

  return (
    <form className="stack" onSubmit={submit}>
      {sucesso && (
        <Alert variant="success">
          <b>{sucesso.nome}</b> recebido de <b>{sucesso.alunoNome}</b>
          {sucesso.alunoCriado ? ' (conta criada)' : ''} — aguardando produção. As <b>{sucesso.valor}</b> fichas serão
          creditadas no push. Código <span className="mono">{sucesso.codigo}</span>.
        </Alert>
      )}

      <div className={cx('card', styles.painel)}>
        <h3 className={styles.painelTitulo}>Dados do item</h3>
        <div className={styles.grid}>
        <div className={cx(styles.autocomplete, styles.full)}>
          <TextInput
            label="Nome do item"
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
            <div className={styles.suggestions}>
              {sugestoes.map((p) => (
                <button key={p.id} type="button" onMouseDown={() => escolherSugestao(p)}>
                  <span>
                    {p.nome} <span className="muted">· {p.categoria}</span>
                  </span>
                  <span className={styles.v}>{p.valor} fichas</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <SelectField label="Categoria" value={categoria} onChange={(e) => setCategoria(e.target.value)} disabled={loading}>
          {CATEGORIAS.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </SelectField>

        <TextInput
          label="Valor (fichas)"
          type="number"
          min={1}
          step={1}
          inputMode="numeric"
          mono
          value={valor}
          onChange={(e) => setValor(e.target.value)}
          placeholder="10"
          disabled={loading}
        />

        <SelectField
          label="Unidade do item"
          value={unidade}
          onChange={(e) => setUnidade(e.target.value as Unidade)}
          disabled={loading}
        >
          {UNIDADES.map((u) => (
            <option key={u} value={u}>
              {u}
            </option>
          ))}
        </SelectField>

        <TextInput
          label="Matrícula do aluno"
          mono
          value={matricula}
          onChange={(e) => setMatricula(e.target.value)}
          placeholder="99999999"
          autoComplete="off"
          disabled={loading}
          hint={alunoBuscado ? (aluno ? `Aluno: ${aluno.nome} (saldo ${aluno.saldo})` : 'Novo aluno — conta será criada.') : undefined}
        />

        <TextareaField
          containerClassName={styles.full}
          label="Descrição (opcional)"
          value={descricao}
          onChange={(e) => setDescricao(e.target.value)}
          placeholder="Estado do item, detalhes, observações…"
          rows={3}
          maxLength={500}
          disabled={loading}
          hint="Visível para admin, atendente de entrada e comprador."
        />
        </div>
      </div>

      {erro && <Alert variant="error">{erro}</Alert>}

      <div>
        <Button type="submit" variant="primary" disabled={loading}>
          {loading ? 'Cadastrando…' : 'Cadastrar'}
        </Button>
      </div>
    </form>
  );
}
