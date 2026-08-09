'use client';

import { useEffect, useRef, useState } from 'react';
import { Papel, Unidade } from '@prisma/client';
import { Warning } from '@phosphor-icons/react';
import { editarUsuarioAction, ajustarSaldoAction, listarUsuariosAction } from '@/app/actions/admin';
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
} from '@/components/ui';
import type { UsuarioAdmin } from '@/server/queries';
import styles from './admin.module.css';

const PAPEIS = Object.values(Papel);
const UNIDADES = Object.values(Unidade);

const AVISO_PENDENTE = 'Conta pendente: defina papel e unidade';

export function AdminUsuarios({ initial, unidade }: { initial: UsuarioAdmin[]; unidade?: Unidade }) {
  const [usuarios, setUsuarios] = useState(initial);
  const [busca, setBusca] = useState('');
  const deb = useRef<ReturnType<typeof setTimeout> | null>(null);
  const primeiro = useRef(true);

  useEffect(() => {
    if (primeiro.current) {
      primeiro.current = false;
      return;
    }
    if (deb.current) clearTimeout(deb.current);
    deb.current = setTimeout(async () => {
      const r = await chamar(listarUsuariosAction({ busca, unidade }));
      if (r.ok) setUsuarios(r.data);
    }, 250);
    return () => {
      if (deb.current) clearTimeout(deb.current);
    };
  }, [busca, unidade]);

  return (
    <div className="stack">
      <SearchField
        value={busca}
        onValueChange={setBusca}
        placeholder="Buscar por nome, email ou matrícula…"
        ariaLabel="Buscar usuário"
      />
      {usuarios.length === 0 ? (
        <EmptyCard>Nenhum usuário.</EmptyCard>
      ) : (
        usuarios.map((u) => (
          <UsuarioRow key={u.id} usuario={u} onSalvo={(nu) => setUsuarios((prev) => prev.map((x) => (x.id === nu.id ? nu : x)))} />
        ))
      )}
    </div>
  );
}

function UsuarioRow({ usuario, onSalvo }: { usuario: UsuarioAdmin; onSalvo: (usuario: UsuarioAdmin) => void }) {
  const [nome, setNome] = useState(usuario.nome);
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
      let atualizado: UsuarioAdmin = usuario;
      if (salvarPerfil) {
        const r = await chamar(editarUsuarioAction({ id: usuario.id, nome: nome.trim(), papel: papel as Papel, unidade: unidade as Unidade }));
        if (!r.ok) return setMsg(mensagemErro(r.error.code, r.error.message));
        atualizado = r.data;
      }
      if (saldoDirty) {
        const r = await chamar(ajustarSaldoAction({ id: usuario.id, novoSaldo: Number(saldo) }));
        if (!r.ok) return setMsg(mensagemErro(r.error.code, r.error.message));
        atualizado = { ...atualizado, saldo: r.data.saldoAtual };
      }
      onSalvo(atualizado);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack-sm">
      <DataRow className={cx(styles.linhaUsuario, usuario.pendente && styles.linhaPendente)}>
        <DataCell
          label={
            <>
              Nome
              {usuario.pendente && (
                <span className={styles.avisoPendente} title={AVISO_PENDENTE} aria-hidden>
                  <Warning size={14} weight="fill" />
                </span>
              )}
            </>
          }
        >
          <DataInput value={nome} onChange={(e) => setNome(e.target.value)} disabled={busy} />
        </DataCell>
        <DataCell label="Papel">
          <DataSelect value={papel} onChange={(e) => setPapel(e.target.value as Papel | '')} disabled={busy}>
            <option value="" disabled>
              — selecione —
            </option>
            {PAPEIS.map((p) => (
              <option key={p} value={p}>
                {p.replace('_', ' ')}
              </option>
            ))}
          </DataSelect>
        </DataCell>
        <DataCell label="Unidade">
          <DataSelect value={unidade} onChange={(e) => setUnidade(e.target.value as Unidade | '')} disabled={busy}>
            <option value="" disabled>
              — selecione —
            </option>
            {UNIDADES.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </DataSelect>
        </DataCell>
        <DataCell label="Saldo">
          <DataInput mono type="number" min={0} value={saldo} onChange={(e) => setSaldo(e.target.value)} disabled={busy} />
        </DataCell>
        <RowActions className={styles.acoesUsuario}>
          {usuario.pendente && (
            <span role="status" className={styles.apenasLeitor}>
              {AVISO_PENDENTE}
            </span>
          )}
          <Tooltip
            align="right"
            items={[
              { label: 'Email', value: usuario.email },
              { label: 'Matrícula', value: usuario.codigoCarteira },
            ]}
          />
          <Button variant="primary" size="sm" onClick={salvar} disabled={!podeSalvar}>
            Salvar
          </Button>
        </RowActions>
      </DataRow>
      {msg && <Alert variant="error">{msg}</Alert>}
    </div>
  );
}
