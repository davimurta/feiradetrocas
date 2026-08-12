'use client';

import { useEffect, useState, useTransition } from 'react';
import { Unidade } from '@prisma/client';
import { Plus, Copy, Check, Prohibit, ArrowClockwise, ClockClockwise } from '@phosphor-icons/react';
import {
  criarConviteAction,
  listarConvitesAction,
  definirConviteAtivoAction,
  estenderConviteAction,
} from '@/app/actions/convites';
import type { ConviteView } from '@/domain/convite';
import { formatarCodigo } from '@/lib/convite';
import { chamar } from '@/lib/acao';
import { mensagemErro } from '@/lib/mensagens';
import { Alert, Button, SelectField, TextInput, EmptyCard } from '@/components/ui';
import styles from './acessos.module.css';

const VALIDADES = [
  { horas: 8, rotulo: '8 horas' },
  { horas: 24, rotulo: '1 dia' },
  { horas: 72, rotulo: '3 dias' },
  { horas: 168, rotulo: '1 semana' },
];

function quando(data: Date): string {
  return new Date(data).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function situacao(c: ConviteView): string {
  if (!c.ativo) return 'revogado';
  if (new Date(c.expiraEm) <= new Date()) return 'expirado';
  if (c.maxUsos !== null && c.usos >= c.maxUsos) return 'esgotado';
  return 'válido';
}

export function AdminConvites() {
  const [convites, setConvites] = useState<ConviteView[]>([]);
  const [unidade, setUnidade] = useState<Unidade>('barroca');
  const [descricao, setDescricao] = useState('');
  const [validade, setValidade] = useState(24);
  const [maxUsos, setMaxUsos] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [copiado, setCopiado] = useState<string | null>(null);
  const [carregando, iniciar] = useTransition();

  function carregar() {
    iniciar(async () => {
      const r = await chamar(listarConvitesAction());
      if (r.ok) setConvites(r.data);
      else setErro(mensagemErro(r.error.code, r.error.message));
    });
  }

  useEffect(carregar, []);

  async function criar() {
    setErro(null);
    const r = await chamar(
      criarConviteAction({
        unidade,
        descricao: descricao || undefined,
        validadeHoras: validade,
        maxUsos: maxUsos ? Number(maxUsos) : null,
      }),
    );
    if (!r.ok) {
      setErro(mensagemErro(r.error.code, r.error.message));
      return;
    }
    setDescricao('');
    setConvites((atual) => [r.data, ...atual]);
  }

  async function alternar(c: ConviteView) {
    const r = await chamar(definirConviteAtivoAction({ id: c.id, ativo: !c.ativo }));
    if (r.ok) setConvites((atual) => atual.map((x) => (x.id === c.id ? r.data : x)));
    else setErro(mensagemErro(r.error.code, r.error.message));
  }

  async function estender(c: ConviteView) {
    const r = await chamar(estenderConviteAction({ id: c.id, horas: 24 }));
    if (r.ok) setConvites((atual) => atual.map((x) => (x.id === c.id ? r.data : x)));
    else setErro(mensagemErro(r.error.code, r.error.message));
  }

  async function copiar(codigo: string) {
    await navigator.clipboard?.writeText(formatarCodigo(codigo));
    setCopiado(codigo);
    setTimeout(() => setCopiado((v) => (v === codigo ? null : v)), 2000);
  }

  return (
    <section className="stack">
      {erro && <Alert variant="error">{erro}</Alert>}

      <Alert>
        O convite serve para quem não tem matrícula no Cotemig: professores, funcionários,
        visitantes e convidados. Ele é multiuso e vale até a data de expiração, então basta
        gerar um por grupo e distribuir. A unidade fica gravada no código, e quem entra por ele
        já cai como participante ativo.
      </Alert>

      <div className={styles.barra}>
        <SelectField
          label="Unidade do convite"
          value={unidade}
          onChange={(e) => setUnidade(e.target.value as Unidade)}
        >
          <option value="barroca">barroca</option>
          <option value="floresta">floresta</option>
        </SelectField>

        <SelectField
          label="Validade"
          value={String(validade)}
          onChange={(e) => setValidade(Number(e.target.value))}
        >
          {VALIDADES.map((v) => (
            <option key={v.horas} value={v.horas}>
              {v.rotulo}
            </option>
          ))}
        </SelectField>

        <TextInput
          label="Máximo de usos"
          type="number"
          min={1}
          value={maxUsos}
          onChange={(e) => setMaxUsos(e.target.value)}
          placeholder="sem limite"
        />

        <TextInput
          label="Para quem é"
          value={descricao}
          onChange={(e) => setDescricao(e.target.value)}
          placeholder="professores, visitantes..."
        />

        <Button variant="primary" onClick={criar} disabled={carregando}>
          <Plus size={16} weight="bold" /> Gerar convite
        </Button>

        <Button variant="ghost" onClick={carregar} disabled={carregando}>
          <ArrowClockwise size={16} weight="bold" /> Atualizar
        </Button>
      </div>

      {convites.length === 0 ? (
        <EmptyCard>Nenhum convite gerado ainda.</EmptyCard>
      ) : (
        <div className={styles.tabelaWrap}>
          <table className={styles.tabela}>
            <caption className={styles.caption}>
              Quem tiver o código cria conta na feira. Trate como senha da organização:
              distribua para o grupo certo e revogue quando não precisar mais.
            </caption>
            <thead>
              <tr>
                <th>Código</th>
                <th>Para quem</th>
                <th>Unidade</th>
                <th className={styles.num}>Usos</th>
                <th>Expira</th>
                <th>Situação</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {convites.map((c) => (
                <tr key={c.id} className={c.valido ? undefined : styles.linhaFalha}>
                  <td data-rotulo="Código">
                    <code className={styles.codigo}>{formatarCodigo(c.codigo)}</code>
                  </td>
                  <td data-rotulo="Para quem">{c.descricao ?? 'n/d'}</td>
                  <td data-rotulo="Unidade">{c.unidade}</td>
                  <td data-rotulo="Usos" className={styles.num}>
                    {c.usos}
                    {c.maxUsos !== null ? ` / ${c.maxUsos}` : ''}
                  </td>
                  <td data-rotulo="Expira" className={styles.quando}>{quando(c.expiraEm)}</td>
                  <td data-rotulo="Situação">
                    <span className={c.valido ? styles.ok : styles.falha}>{situacao(c)}</span>
                  </td>
                  <td>
                    <div className={styles.acoes}>
                      <Button variant="ghost" size="sm" onClick={() => copiar(c.codigo)}>
                        {copiado === c.codigo ? (
                          <>
                            <Check size={15} weight="bold" /> Copiado
                          </>
                        ) : (
                          <>
                            <Copy size={15} weight="bold" /> Copiar
                          </>
                        )}
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => estender(c)}>
                        <ClockClockwise size={15} weight="bold" /> +1 dia
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => alternar(c)}>
                        <Prohibit size={15} weight="bold" /> {c.ativo ? 'Revogar' : 'Reativar'}
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
