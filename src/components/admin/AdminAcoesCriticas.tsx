'use client';

import { useCallback, useEffect, useState } from 'react';
import { ArrowsLeftRight, Prohibit, Coins, LockOpen, XCircle } from '@phosphor-icons/react';
import { Unidade } from '@prisma/client';
import {
  previaAcoesCriticasAction,
  zerarSaldosAction,
  creditarEmLoteAction,
  moverItensDeUnidadeAction,
  cancelarPedidosPendentesAction,
  desbloquearContasAction,
} from '@/app/actions/acoesCriticas';
import { FRASE_CONFIRMACAO, confirmacaoValida } from '@/lib/acoesCriticas';
import type { PreviaAcoesCriticas } from '@/domain/acoesCriticas';
import { chamar } from '@/lib/acao';
import { mensagemErro } from '@/lib/mensagens';
import { cx } from '@/lib/cx';
import { Alert, Button, Modal, TextInput, SelectField } from '@/components/ui';
import styles from './acoesCriticas.module.css';

type Chave = 'zerar' | 'creditar' | 'mover' | 'cancelar' | 'desbloquear';

interface Resultado {
  ok: boolean;
  texto: string;
}

export function AdminAcoesCriticas() {
  const [previa, setPrevia] = useState<PreviaAcoesCriticas | null>(null);
  const [aberta, setAberta] = useState<Chave | null>(null);
  const [confirmacao, setConfirmacao] = useState('');
  const [busy, setBusy] = useState(false);
  const [resultado, setResultado] = useState<Resultado | null>(null);

  const [apenasParticipantes, setApenasParticipantes] = useState(true);
  const [valorCredito, setValorCredito] = useState('10');
  const [origem, setOrigem] = useState<Unidade>('barroca');
  const [destino, setDestino] = useState<Unidade>('floresta');
  const [motivo, setMotivo] = useState('Cancelado pela organização');

  const recarregar = useCallback(async () => {
    const r = await chamar(previaAcoesCriticasAction());
    if (r.ok) setPrevia(r.data);
  }, []);

  useEffect(() => {
    void recarregar();
  }, [recarregar]);

  function abrir(chave: Chave) {
    setAberta(chave);
    setConfirmacao('');
    setResultado(null);
  }

  function fechar() {
    setAberta(null);
    setConfirmacao('');
  }

  async function executar() {
    if (!aberta || busy) return;
    setBusy(true);

    const r = await (async () => {
      switch (aberta) {
        case 'zerar':
          return chamar(zerarSaldosAction({ confirmacao, apenasParticipantes }));
        case 'creditar':
          return chamar(
            creditarEmLoteAction({
              confirmacao,
              apenasParticipantes,
              valor: Number(valorCredito),
            }),
          );
        case 'mover':
          return chamar(moverItensDeUnidadeAction({ confirmacao, de: origem, para: destino }));
        case 'cancelar':
          return chamar(cancelarPedidosPendentesAction({ confirmacao, motivo }));
        case 'desbloquear':
          return chamar(desbloquearContasAction({ confirmacao }));
      }
    })();

    setBusy(false);

    if (!r.ok) {
      setResultado({ ok: false, texto: mensagemErro(r.error.code, r.error.message) });
      return;
    }

    setResultado({ ok: true, texto: descreverResultado(aberta, r.data) });
    fechar();
    void recarregar();
  }

  const acoes = definirAcoes(previa);
  const atual = acoes.find((a) => a.chave === aberta);
  const confirmado = confirmacaoValida(confirmacao);

  return (
    <div className="stack">
      <Alert variant="error" role="note">
        <strong>Ações em massa e sem desfazer.</strong> Cada uma altera todos os registros de
        uma vez. Faça backup do banco antes de usar durante o evento.
      </Alert>

      {resultado && (
        <Alert variant={resultado.ok ? 'success' : 'error'}>{resultado.texto}</Alert>
      )}

      {previa && (
        <section className={styles.resumo}>
          <Numero valor={previa.participantes} rotulo="Participantes" />
          <Numero valor={previa.fichasEmCirculacao} rotulo="Fichas em circulação" />
          <Numero valor={previa.contasComSaldo} rotulo="Contas com saldo" />
          <Numero valor={previa.pedidosPendentes} rotulo="Pedidos pendentes" />
          <Numero valor={previa.contasBloqueadas} rotulo="Contas bloqueadas" />
        </section>
      )}

      <div className={styles.grade}>
        {acoes.map((a) => (
          <article key={a.chave} className={cx(styles.cartao, a.perigo && styles.perigo)}>
            <div className={styles.cabecalho}>
              <span className={cx(styles.icone, a.perigo && styles.iconePerigo)}>{a.icone}</span>
              <h3 className={styles.titulo}>{a.titulo}</h3>
            </div>
            <p className={styles.descricao}>{a.descricao}</p>
            <p className={styles.impacto}>{a.impacto}</p>
            <div className={styles.rodape}>
              <Button
                variant={a.perigo ? 'dangerOutline' : 'ghost'}
                size="sm"
                onClick={() => abrir(a.chave)}
                disabled={a.desabilitada}
              >
                {a.rotuloBotao}
              </Button>
            </div>
          </article>
        ))}
      </div>

      {atual && (
        <Modal title={atual.titulo} onClose={fechar} ariaLabel={`Confirmar: ${atual.titulo}`}>
          <div className="stack-sm">
            <Alert variant="error">{atual.aviso}</Alert>

            {(aberta === 'zerar' || aberta === 'creditar') && (
              <SelectField
                label="Aplicar a"
                value={apenasParticipantes ? 'participantes' : 'todos'}
                onChange={(e) => setApenasParticipantes(e.target.value === 'participantes')}
                disabled={busy}
              >
                <option value="participantes">Somente participantes</option>
                <option value="todos">Todas as contas</option>
              </SelectField>
            )}

            {aberta === 'creditar' && (
              <TextInput
                label="Fichas por conta"
                type="number"
                min={1}
                mono
                value={valorCredito}
                onChange={(e) => setValorCredito(e.target.value)}
                disabled={busy}
              />
            )}

            {aberta === 'mover' && (
              <>
                <SelectField
                  label="De"
                  value={origem}
                  onChange={(e) => setOrigem(e.target.value as Unidade)}
                  disabled={busy}
                >
                  {Object.values(Unidade).map((u) => (
                    <option key={u} value={u}>
                      {u}
                    </option>
                  ))}
                </SelectField>
                <SelectField
                  label="Para"
                  value={destino}
                  onChange={(e) => setDestino(e.target.value as Unidade)}
                  disabled={busy}
                  error={origem === destino ? 'Escolha unidades diferentes.' : null}
                >
                  {Object.values(Unidade).map((u) => (
                    <option key={u} value={u}>
                      {u}
                    </option>
                  ))}
                </SelectField>
              </>
            )}

            {aberta === 'cancelar' && (
              <TextInput
                label="Motivo registrado no pedido"
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                maxLength={200}
                disabled={busy}
              />
            )}

            <TextInput
              label={`Digite ${FRASE_CONFIRMACAO} para liberar`}
              mono
              value={confirmacao}
              onChange={(e) => setConfirmacao(e.target.value)}
              placeholder={FRASE_CONFIRMACAO}
              autoComplete="off"
              disabled={busy}
            />

            <div className={styles.acoesModal}>
              <Button variant="ghost" onClick={fechar} disabled={busy}>
                Cancelar
              </Button>
              <Button
                variant="danger"
                onClick={executar}
                disabled={busy || !confirmado || (aberta === 'mover' && origem === destino)}
              >
                {busy ? 'Executando…' : atual.rotuloBotao}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

function Numero({ valor, rotulo }: { valor: number; rotulo: string }) {
  return (
    <div className={styles.numero}>
      <span className={styles.numeroValor}>{valor}</span>
      <span className={styles.numeroRotulo}>{rotulo}</span>
    </div>
  );
}

interface AcaoDescrita {
  chave: Chave;
  titulo: string;
  descricao: string;
  impacto: string;
  aviso: string;
  rotuloBotao: string;
  icone: React.ReactNode;
  perigo: boolean;
  desabilitada: boolean;
}

function definirAcoes(previa: PreviaAcoesCriticas | null): AcaoDescrita[] {
  const barroca = previa?.estoquePorUnidade.find((e) => e.unidade === 'barroca');
  const floresta = previa?.estoquePorUnidade.find((e) => e.unidade === 'floresta');

  return [
    {
      chave: 'zerar',
      titulo: 'Zerar saldo de todas as contas',
      descricao:
        'Coloca o saldo em zero e registra um ajuste manual negativo por conta, mantendo o extrato coerente.',
      impacto: previa
        ? `${previa.contasComSaldo} contas com saldo · ${previa.fichasEmCirculacao} fichas seriam apagadas`
        : 'Carregando…',
      aviso:
        'As fichas de todos somem. O extrato de cada aluno vai registrar o estorno, mas o saldo não volta sozinho.',
      rotuloBotao: 'Zerar saldos',
      icone: <Prohibit size={20} weight="bold" />,
      perigo: true,
      desabilitada: previa?.contasComSaldo === 0,
    },
    {
      chave: 'creditar',
      titulo: 'Creditar fichas em lote',
      descricao:
        'Soma a mesma quantidade de fichas a cada conta, com ajuste manual registrado, o mesmo efeito de rodar SQL na mão, só que auditado.',
      impacto: previa ? `${previa.participantes} participantes receberiam o crédito` : 'Carregando…',
      aviso: 'O crédito entra como ajuste manual e aparece no painel de métricas.',
      rotuloBotao: 'Creditar',
      icone: <Coins size={20} weight="bold" />,
      perigo: false,
      desabilitada: false,
    },
    {
      chave: 'mover',
      titulo: 'Mover itens entre unidades',
      descricao:
        'Transfere o catálogo e a fila de pendentes de uma unidade para a outra. Itens iguais que já existam no destino têm a quantidade somada.',
      impacto:
        barroca && floresta
          ? `barroca: ${barroca.produtos} produtos / ${barroca.pecas} peças · floresta: ${floresta.produtos} / ${floresta.pecas}`
          : 'Carregando…',
      aviso:
        'O stand da unidade de origem deixa de ver esses itens imediatamente. Pedidos pendentes daquele estoque podem ser recusados por falta de item.',
      rotuloBotao: 'Mover itens',
      icone: <ArrowsLeftRight size={20} weight="bold" />,
      perigo: true,
      desabilitada: false,
    },
    {
      chave: 'cancelar',
      titulo: 'Cancelar pedidos pendentes',
      descricao:
        'Fecha todos os pedidos que estão esperando aprovação. Serve quando um stand travou ou o evento acabou com propostas em aberto.',
      impacto: previa ? `${previa.pedidosPendentes} pedidos aguardando aprovação` : 'Carregando…',
      aviso: 'Os alunos perdem a tela de aprovação em aberto. Nenhum saldo é movimentado.',
      rotuloBotao: 'Cancelar pedidos',
      icone: <XCircle size={20} weight="bold" />,
      perigo: false,
      desabilitada: previa?.pedidosPendentes === 0,
    },
    {
      chave: 'desbloquear',
      titulo: 'Desbloquear todas as contas',
      descricao: 'Remove o bloqueio de todas as contas bloqueadas por reporte.',
      impacto: previa ? `${previa.contasBloqueadas} contas bloqueadas` : 'Carregando…',
      aviso: 'Todos os bloqueios aplicados por reporte serão desfeitos de uma vez.',
      rotuloBotao: 'Desbloquear',
      icone: <LockOpen size={20} weight="bold" />,
      perigo: false,
      desabilitada: previa?.contasBloqueadas === 0,
    },
  ];
}

function descreverResultado(chave: Chave, dados: unknown): string {
  const d = dados as Record<string, number>;
  switch (chave) {
    case 'zerar':
      return `${d.contasAfetadas} contas zeradas · ${d.fichas} fichas retiradas de circulação.`;
    case 'creditar':
      return `${d.contasAfetadas} contas creditadas · ${d.fichas} fichas distribuídas.`;
    case 'mover':
      return `${d.movidos} produtos movidos, ${d.mesclados} mesclados com itens iguais no destino (${d.pecas} peças) · ${d.pendentesMovidos} pendentes.`;
    case 'cancelar':
      return `${d.cancelados} pedidos cancelados.`;
    case 'desbloquear':
      return `${d.desbloqueadas} contas desbloqueadas.`;
  }
}
