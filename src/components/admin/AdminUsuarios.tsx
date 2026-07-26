'use client';

import { useEffect, useRef, useState } from 'react';
import { Papel, Unidade } from '@prisma/client';
import { editarUsuarioAction, ajustarSaldoAction, listarUsuariosAction } from '@/app/actions/admin';
import { mensagemErro } from '@/lib/mensagens';
import type { UsuarioAdmin } from '@/server/queries';

const PAPEIS = Object.values(Papel);
const UNIDADES = Object.values(Unidade);

export function AdminUsuarios({ initial, unidade }: { initial: UsuarioAdmin[]; unidade?: Unidade }) {
  const [usuarios, setUsuarios] = useState(initial);
  const [busca, setBusca] = useState('');
  const deb = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function recarregar(q = busca) {
    const r = await listarUsuariosAction({ busca: q, unidade });
    if (r.ok) setUsuarios(r.data);
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
          placeholder="Buscar por nome, email ou matrícula…"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          aria-label="Buscar usuário"
        />
      </div>
      {usuarios.length === 0 ? (
        <div className="card center muted">Nenhum usuário.</div>
      ) : (
        usuarios.map((u) => <UsuarioRow key={u.id} usuario={u} onChanged={() => recarregar()} />)
      )}
    </div>
  );
}

function UsuarioRow({ usuario, onChanged }: { usuario: UsuarioAdmin; onChanged: () => void }) {
  const [nome, setNome] = useState(usuario.nome);
  // Conta pendente começa sem papel/unidade selecionados ("— selecione —"), obrigando o
  // admin a escolher (mesmo que a escolha seja o valor padrão) para liberar.
  const [papel, setPapel] = useState<Papel | ''>(usuario.pendente ? '' : usuario.papel);
  const [unidade, setUnidade] = useState<Unidade | ''>(usuario.pendente ? '' : usuario.unidade);
  const [saldo, setSaldo] = useState(String(usuario.saldo));
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const perfilPreenchido = papel !== '' && unidade !== '';
  const querAtivar = usuario.pendente;
  const perfilMudou = nome !== usuario.nome || papel !== usuario.papel || unidade !== usuario.unidade;
  const salvarPerfil = querAtivar || perfilMudou;
  const saldoDirty = Number(saldo) !== usuario.saldo;
  const podeSalvar = !busy && perfilPreenchido && (salvarPerfil || saldoDirty);

  async function salvar() {
    setMsg(null);
    setBusy(true);
    try {
      if (salvarPerfil) {
        const r = await editarUsuarioAction({ id: usuario.id, nome: nome.trim(), papel: papel as Papel, unidade: unidade as Unidade });
        if (!r.ok) return setMsg(mensagemErro(r.error.code, r.error.message));
      }
      if (saldoDirty) {
        const r = await ajustarSaldoAction({ id: usuario.id, novoSaldo: Number(saldo) });
        if (!r.ok) return setMsg(mensagemErro(r.error.code, r.error.message));
      }
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack-sm">
      <div className="edit-row">
        <div className="field-sm" style={{ gridColumn: 'span 2' }}>
          <label>
            Nome{' '}
            {usuario.pendente && (
              <span className="badge-pendente">pendente — defina papel/unidade</span>
            )}
          </label>
          <input className="input" value={nome} onChange={(e) => setNome(e.target.value)} disabled={busy} />
        </div>
        <div className="field-sm" style={{ gridColumn: 'span 2' }}>
          <label>Email</label>
          <span className="ro" title={usuario.email}>
            {usuario.email}
          </span>
        </div>
        <div className="field-sm">
          <label>Papel</label>
          <select className="select" value={papel} onChange={(e) => setPapel(e.target.value as Papel | '')} disabled={busy}>
            <option value="" disabled>
              — selecione —
            </option>
            {PAPEIS.map((p) => (
              <option key={p} value={p}>
                {p.replace('_', ' ')}
              </option>
            ))}
          </select>
        </div>
        <div className="field-sm">
          <label>Unidade</label>
          <select className="select" value={unidade} onChange={(e) => setUnidade(e.target.value as Unidade | '')} disabled={busy}>
            <option value="" disabled>
              — selecione —
            </option>
            {UNIDADES.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </select>
        </div>
        <div className="field-sm">
          <label>Saldo</label>
          <input className="input mono" type="number" min={0} value={saldo} onChange={(e) => setSaldo(e.target.value)} disabled={busy} />
        </div>
        <div className="row-actions">
          <button className="btn btn--primary btn-sm" onClick={salvar} disabled={!podeSalvar}>
            Salvar
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
