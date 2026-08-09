'use client';

import { useEffect, useRef, useState } from 'react';
import { Camera, X } from '@phosphor-icons/react/dist/ssr';
import { cx } from '@/lib/cx';
import { Button } from '@/components/ui';
import fieldStyles from '@/components/ui/Field.module.css';
import styles from './CodeScanner.module.css';

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
  const [canScan, setCanScan] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [camError, setCamError] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    setCanScan(typeof window !== 'undefined' && 'BarcodeDetector' in window);
    return () => stopCamera();
  }, []);

  function stopCamera() {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setScanning(false);
  }

  async function startCamera() {
    setCamError(null);
    try {
      // @ts-expect-error BarcodeDetector ainda não está no lib.dom padrão
      const detector = new window.BarcodeDetector({ formats: ['qr_code'] });
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
      });
      streamRef.current = stream;
      setScanning(true);
      const video = videoRef.current!;
      video.srcObject = stream;
      await video.play();

      const tick = async () => {
        if (!streamRef.current) return;
        try {
          const codes = await detector.detect(video);
          if (codes.length > 0) {
            const raw = String(codes[0].rawValue ?? '').trim().toUpperCase();
            if (raw) {
              stopCamera();
              setValue(raw);
              onSubmit(raw);
              return;
            }
          }
        } catch {
          /* frame sem código — segue */
        }
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
    } catch {
      setCamError('Não foi possível abrir a câmera. Use a digitação manual.');
      stopCamera();
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
        {canScan && (
          <Button
            variant="ghost"
            onClick={() => (scanning ? stopCamera() : startCamera())}
            aria-label={scanning ? 'Parar câmera' : 'Escanear com a câmera'}
            title="Escanear com a câmera"
          >
            {scanning ? <X size={20} weight="bold" /> : <Camera size={20} weight="bold" />}
          </Button>
        )}
        <Button type="submit" variant="primary" disabled={busy || !value.trim()}>
          {busy ? '…' : submitLabel}
        </Button>
      </div>

      {scanning && (
        <div className={styles.frame}>
          {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
          <video ref={videoRef} playsInline muted className={styles.video} />
        </div>
      )}
      {camError && <p className={cx('muted', styles.camError)}>{camError}</p>}
    </form>
  );
}
