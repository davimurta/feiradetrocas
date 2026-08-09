'use client';

import { useState } from 'react';
import type { ActionResult } from '@/app/actions/_result';
import type { CriarReporteResult } from '@/domain/reporte';
import { mensagemErro } from '@/lib/mensagens';
import { chamar } from '@/lib/acao';
import { Alert, Button, Modal, TextInput, TextareaField } from '@/components/ui';

export function ReportarModal({
  pedidoId,
  reportar,
  onFechar,
}: {
  pedidoId: string;
  reportar: (input: { pedidoId: string; motivo: string; descricao?: string }) => Promise<ActionResult<CriarReporteResult>>;
  onFechar: () => void;
}) {
  const [motivo, setMotivo] = useState('');
  const [descricao, setDescricao] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (!motivo.trim()) return setMsg({ ok: false, texto: 'Informe o motivo.' });
    setBusy(true);
    setMsg(null);
    const r = await chamar(reportar({ pedidoId, motivo: motivo.trim(), descricao: descricao.trim() || undefined }));
    setBusy(false);
    if (r.ok) setMsg({ ok: true, texto: `Reporte registrado contra ${r.data.reportadoNome}.` });
    else setMsg({ ok: false, texto: mensagemErro(r.error.code, r.error.message) });
  }

  return (
    <Modal title="Reportar comprador" onClose={onFechar}>
      {msg && <Alert variant={msg.ok ? 'success' : 'error'}>{msg.texto}</Alert>}

      {msg?.ok ? (
        <Button variant="primary" block onClick={onFechar}>
          Fechar
        </Button>
      ) : (
        <form className="stack-sm" onSubmit={enviar}>
          <TextInput
            label="Motivo"
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Ex.: furto"
            maxLength={80}
            disabled={busy}
          />
          <TextareaField
            label="Descrição"
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
            placeholder="Descreva o que aconteceu…"
            rows={3}
            maxLength={500}
            disabled={busy}
          />
          <Button type="submit" variant="primary" block disabled={busy}>
            {busy ? 'Enviando…' : 'Enviar reporte'}
          </Button>
        </form>
      )}
    </Modal>
  );
}
