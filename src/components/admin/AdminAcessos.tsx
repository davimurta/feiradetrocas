'use client';

import { useEffect, useState, useTransition } from 'react';
import { ArrowClockwise, LockOpen, Broom } from '@phosphor-icons/react';
import {
  listarAcessosAction,
  desbloquearAcessoAction,
  limparAcessosExpiradosAction,
} from '@/app/actions/acessos';
import type { AcessosView } from '@/server/acessos';
import { chamar } from '@/lib/acao';
import { mensagemErro } from '@/lib/mensagens';
import { formatarEspera } from '@/components/Contador';
import { Alert, Button, SearchField, SelectField, EmptyCard } from '@/components/ui';
import styles from './acessos.module.css';

const JANELAS = [
  { valor: 1, rotulo: 'Última hora' },
  { valor: 24, rotulo: 'Últimas 24 horas' },
  { valor: 72, rotulo: 'Últimos 3 dias' },
];

function hora(data: Date): string {
  return new Date(data).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function restam(ate: Date): string {
  return formatarEspera((new Date(ate).getTime() - Date.now()) / 1000);
}

export function AdminAcessos() {
  const [dados, setDados] = useState<AcessosView | null>(null);
  const [busca, setBusca] = useState('');
  const [horas, setHoras] = useState(24);
  const [apenasFalhas, setApenasFalhas] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [carregando, iniciar] = useTransition();

  function carregar() {
    iniciar(async () => {
      const r = await chamar(listarAcessosAction({ busca, horas, apenasFalhas }));
      if (r.ok) {
        setDados(r.data);
        setErro(null);
      } else {
        setErro(mensagemErro(r.error.code, r.error.message));
      }
    });
  }

  useEffect(() => {
    const t = setTimeout(carregar, busca ? 300 : 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busca, horas, apenasFalhas]);

  async function desbloquear(identificador: string) {
    const r = await chamar(desbloquearAcessoAction({ identificador }));
    if (!r.ok) {
      setErro(mensagemErro(r.error.code, r.error.message));
      return;
    }
    setAviso(`Desbloqueado: ${identificador}`);
    carregar();
  }

  async function limpar() {
    const r = await chamar(limparAcessosExpiradosAction());
    if (!r.ok) {
      setErro(mensagemErro(r.error.code, r.error.message));
      return;
    }
    setAviso(`Removidos ${r.data.tentativas} registros e ${r.data.baldes} bloqueios vencidos.`);
    carregar();
  }

  return (
    <section className="stack">
      {erro && <Alert variant="error">{erro}</Alert>}
      {aviso && <Alert variant="success">{aviso}</Alert>}

      <div className={styles.resumo}>
        <div className={styles.metrica}>
          <span className={styles.metricaValor}>{dados?.resumo.total ?? '—'}</span>
          <span className={styles.metricaRotulo}>Tentativas na janela</span>
        </div>
        <div className={styles.metrica}>
          <span className={styles.metricaValor}>{dados?.resumo.falhas ?? '—'}</span>
          <span className={styles.metricaRotulo}>Falhas</span>
        </div>
        <div className={styles.metrica}>
          <span className={styles.metricaValor}>{dados?.resumo.identificadoresDistintos ?? '—'}</span>
          <span className={styles.metricaRotulo}>Contas distintas</span>
        </div>
        <div className={styles.metrica}>
          <span className={styles.metricaValor}>{dados?.bloqueios.length ?? '—'}</span>
          <span className={styles.metricaRotulo}>Bloqueios ativos</span>
        </div>
      </div>

      <div className={styles.barra}>
        <SearchField
          ariaLabel="Buscar identificador"
          value={busca}
          onValueChange={setBusca}
          placeholder="email ou matrícula"
        />
        <SelectField label="Janela" value={String(horas)} onChange={(e) => setHoras(Number(e.target.value))}>
          {JANELAS.map((j) => (
            <option key={j.valor} value={j.valor}>
              {j.rotulo}
            </option>
          ))}
        </SelectField>
        <label className={styles.checkbox}>
          <input type="checkbox" checked={apenasFalhas} onChange={(e) => setApenasFalhas(e.target.checked)} />
          Só falhas
        </label>
        <Button variant="ghost" onClick={carregar} disabled={carregando}>
          <ArrowClockwise size={16} weight="bold" /> Atualizar
        </Button>
        <Button variant="ghost" onClick={limpar} disabled={carregando}>
          <Broom size={16} weight="bold" /> Limpar vencidos
        </Button>
      </div>

      {dados && dados.bloqueios.length > 0 && (
        <div className={styles.bloco}>
          <h2 className={styles.blocoTitulo}>Bloqueios ativos</h2>
          <div className={styles.tabelaWrap}>
            <table className={styles.tabela}>
              <thead>
                <tr>
                  <th>Identificador</th>
                  <th>Onde</th>
                  <th>Tipo</th>
                  <th className={styles.num}>Falhas</th>
                  <th className={styles.num}>Libera em</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {dados.bloqueios.map((b) => (
                  <tr key={b.chave}>
                    <td data-rotulo="Identificador">{b.identificador}</td>
                    <td data-rotulo="Onde">{b.escopo}</td>
                    <td data-rotulo="Tipo">{b.tipo === 'ip' ? 'IP' : 'conta'}</td>
                    <td data-rotulo="Falhas" className={styles.num}>{b.falhas}</td>
                    <td data-rotulo="Libera em" className={styles.num}>{restam(b.bloqueadoAte)}</td>
                    <td>
                      <Button variant="ghost" size="sm" onClick={() => desbloquear(b.identificador)}>
                        <LockOpen size={15} weight="bold" /> Desbloquear
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className={styles.bloco}>
        <h2 className={styles.blocoTitulo}>Tentativas recentes</h2>
        {dados && dados.tentativas.length === 0 ? (
          <EmptyCard>Nenhuma tentativa na janela escolhida.</EmptyCard>
        ) : (
          <div className={styles.tabelaWrap}>
            <table className={styles.tabela}>
              <caption className={styles.caption}>
                Registro de autenticação. Senhas nunca são gravadas aqui, só o identificador
                tentado, o resultado e o horário.
              </caption>
              <thead>
                <tr>
                  <th>Quando</th>
                  <th>Identificador</th>
                  <th>Onde</th>
                  <th>Resultado</th>
                  <th>IP</th>
                </tr>
              </thead>
              <tbody>
                {dados?.tentativas.map((t) => (
                  <tr key={t.id} className={t.sucesso ? undefined : styles.linhaFalha}>
                    <td data-rotulo="Quando" className={styles.quando}>{hora(t.createdAt)}</td>
                    <td data-rotulo="Identificador">{t.identificador}</td>
                    <td data-rotulo="Onde">{t.escopo}</td>
                    <td data-rotulo="Resultado">
                      <span className={t.sucesso ? styles.ok : styles.falha}>
                        {t.sucesso ? 'ok' : (t.motivo ?? 'falha')}
                      </span>
                    </td>
                    <td data-rotulo="IP">{t.ip ?? 'n/d'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
