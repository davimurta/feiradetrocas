'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, X } from '@phosphor-icons/react/dist/ssr';
import { cx } from '@/lib/cx';
import { Button } from '@/components/ui';
import fieldStyles from '@/components/ui/Field.module.css';
import styles from './CodeScanner.module.css';

/** Intervalo entre leituras de frame. 10 fps chega e sobra para ler um QR parado. */
const INTERVALO_LEITURA = 100;

interface Leitor {
  detectar: (video: HTMLVideoElement, canvas: HTMLCanvasElement) => Promise<string | null>;
}

/**
 * Escolhe como decodificar o QR.
 *
 * `BarcodeDetector` é nativo e rápido, mas só existe no Chrome/Edge (Android e desktop).
 * Em Safari (todo iPhone) e Firefox ele não existe. Antes o botão da câmera era escondido
 * quando faltava essa API, o que fazia o scanner sumir justamente nos aparelhos mais comuns
 * no balcão. Sem ela, caímos no jsQR, que decodifica em JS puro a partir do canvas.
 */
async function criarLeitor(): Promise<Leitor> {
  if (typeof window !== 'undefined' && 'BarcodeDetector' in window) {
    // @ts-expect-error BarcodeDetector ainda não está no lib.dom padrão
    const detector = new window.BarcodeDetector({ formats: ['qr_code'] });
    return {
      async detectar(video) {
        const codigos = await detector.detect(video);
        return codigos.length > 0 ? String(codigos[0].rawValue ?? '') : null;
      },
    };
  }

  // Import dinâmico: o jsQR só é baixado por quem realmente abre a câmera.
  const { default: jsQR } = await import('jsqr');
  return {
    async detectar(video, canvas) {
      const { videoWidth: largura, videoHeight: altura } = video;
      if (!largura || !altura) return null;
      canvas.width = largura;
      canvas.height = altura;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return null;
      ctx.drawImage(video, 0, 0, largura, altura);
      const frame = ctx.getImageData(0, 0, largura, altura);
      return jsQR(frame.data, largura, altura, { inversionAttempts: 'dontInvert' })?.data ?? null;
    },
  };
}

export function CodeScanner({
  label,
  placeholder,
  submitLabel = 'Buscar',
  onSubmit,
  busy = false,
  autoFocus = false,
}: {
  label: string;
  placeholder?: string;
  submitLabel?: string;
  onSubmit: (codigo: string) => void;
  busy?: boolean;
  autoFocus?: boolean;
}) {
  const [value, setValue] = useState('');
  const [temCamera, setTemCamera] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [camError, setCamError] = useState<string | null>(null);

  // O <video> e o <canvas> ficam SEMPRE montados (escondidos por CSS). Montá-los junto com
  // o estado `scanning` fazia `videoRef.current` ser null no instante em que a câmera
  // abria, porque o React ainda não tinha renderizado o elemento, e a câmera morria com
  // "não foi possível abrir".
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onSubmitRef = useRef(onSubmit);
  onSubmitRef.current = onSubmit;

  const pararCamera = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    const video = videoRef.current;
    if (video) video.srcObject = null;
    setScanning(false);
  }, []);

  useEffect(() => {
    setTemCamera(
      typeof navigator !== 'undefined' && typeof navigator.mediaDevices?.getUserMedia === 'function',
    );
    return () => pararCamera();
  }, [pararCamera]);

  async function abrirCamera() {
    setCamError(null);

    // Fora de contexto seguro o navegador nem oferece a câmera. Acontece ao abrir o app
    // pelo IP da rede local em HTTP. Vale dizer o porquê em vez de "erro ao abrir".
    if (typeof window !== 'undefined' && !window.isSecureContext) {
      setCamError(
        'A câmera só funciona em HTTPS (ou em localhost). Abra o app por HTTPS ou digite o código.',
      );
      return;
    }

    try {
      const leitor = await criarLeitor();
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
      });
      streamRef.current = stream;
      setScanning(true);

      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas) throw new Error('elementos de vídeo indisponíveis');
      video.srcObject = stream;
      await video.play();

      const ler = async () => {
        if (!streamRef.current) return;
        try {
          const bruto = await leitor.detectar(video, canvas);
          const codigo = bruto?.trim().toUpperCase();
          if (codigo) {
            pararCamera();
            setValue(codigo);
            onSubmitRef.current(codigo);
            return;
          }
        } catch {
          /* frame ruim: tenta o próximo */
        }
        timerRef.current = setTimeout(ler, INTERVALO_LEITURA);
      };
      timerRef.current = setTimeout(ler, INTERVALO_LEITURA);
    } catch (err) {
      const negado = err instanceof DOMException && err.name === 'NotAllowedError';
      setCamError(
        negado
          ? 'Permissão de câmera negada. Libere o acesso no navegador ou digite o código.'
          : 'Não foi possível abrir a câmera. Digite o código.',
      );
      pararCamera();
    }
  }

  function submit(e?: React.FormEvent) {
    e?.preventDefault();
    const v = value.trim().toUpperCase();
    if (!v || busy) return;
    onSubmit(v);
  }

  return (
    <form className="stack-sm" onSubmit={submit}>
      <label className={styles.label}>{label}</label>
      <div className="row">
        <input
          className={cx(fieldStyles.input, fieldStyles.mono, 'grow')}
          value={value}
          placeholder={placeholder}
          onChange={(e) => setValue(e.target.value.toUpperCase())}
          autoFocus={autoFocus}
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          inputMode="text"
          disabled={busy}
          aria-label={label}
        />
        {temCamera && (
          <Button
            variant="ghost"
            onClick={() => (scanning ? pararCamera() : abrirCamera())}
            disabled={busy}
            aria-label={scanning ? 'Parar câmera' : 'Escanear QR code com a câmera'}
            title={scanning ? 'Parar câmera' : 'Escanear QR code com a câmera'}
          >
            {scanning ? <X size={20} weight="bold" /> : <Camera size={20} weight="bold" />}
          </Button>
        )}
        <Button type="submit" variant="primary" disabled={busy || !value.trim()}>
          {busy ? '…' : submitLabel}
        </Button>
      </div>

      <div className={cx(styles.frame, !scanning && styles.oculto)} aria-hidden={!scanning}>
        {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
        <video ref={videoRef} playsInline muted className={styles.video} />
        <span className={styles.mira} aria-hidden />
      </div>
      {scanning && <p className={cx('muted', styles.dica)}>Aponte para o QR code da carteira.</p>}

      <canvas ref={canvasRef} className={styles.oculto} aria-hidden />

      {camError && (
        <p className={cx('muted', styles.camError)} role="status">
          {camError}
        </p>
      )}
    </form>
  );
}
