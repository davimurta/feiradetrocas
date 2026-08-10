import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CodeScanner } from '@/components/CodeScanner';

const BOTAO_CAMERA = /Escanear QR code com a câmera/;

function faseStream() {
  const track = { stop: vi.fn() };
  return { getTracks: () => [track], track };
}

function darCamera(getUserMedia: () => Promise<unknown>) {
  Object.defineProperty(navigator, 'mediaDevices', {
    value: { getUserMedia },
    configurable: true,
  });
}

function tirarCamera() {
  Object.defineProperty(navigator, 'mediaDevices', { value: undefined, configurable: true });
}

function contextoSeguro(seguro: boolean) {
  Object.defineProperty(window, 'isSecureContext', { value: seguro, configurable: true });
}

beforeEach(() => {
  contextoSeguro(true);
  HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined);
  // happy-dom não implementa `srcObject`; sem isto a atribuição do stream lança.
  Object.defineProperty(HTMLVideoElement.prototype, 'srcObject', {
    writable: true,
    configurable: true,
    value: null,
  });
});

afterEach(() => {
  tirarCamera();
  delete (window as unknown as Record<string, unknown>).BarcodeDetector;
  vi.restoreAllMocks();
});

describe('CodeScanner (leitura de QR no stand)', () => {
  it('mostra o botão da câmera mesmo sem BarcodeDetector (Safari, Firefox)', async () => {
    darCamera(async () => faseStream());
    render(<CodeScanner label="Carteira do comprador" onSubmit={vi.fn()} />);

    // Antes o botão era escondido quando faltava `BarcodeDetector` — some em todo iPhone.
    expect('BarcodeDetector' in window).toBe(false);
    expect(await screen.findByRole('button', { name: BOTAO_CAMERA })).toBeInTheDocument();
  });

  it('esconde o botão quando o aparelho não tem câmera acessível', () => {
    tirarCamera();
    render(<CodeScanner label="Carteira do comprador" onSubmit={vi.fn()} />);

    expect(screen.queryByRole('button', { name: BOTAO_CAMERA })).not.toBeInTheDocument();
    expect(screen.getByLabelText('Carteira do comprador')).toBeInTheDocument();
  });

  it('lê o QR e envia o código para seguir a compra', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    const detect = vi.fn().mockResolvedValue([{ rawValue: '20240001' }]);
    (window as unknown as Record<string, unknown>).BarcodeDetector = class {
      detect = detect;
    };
    const stream = faseStream();
    darCamera(async () => stream);

    render(<CodeScanner label="Carteira do comprador" onSubmit={onSubmit} />);
    await user.click(await screen.findByRole('button', { name: BOTAO_CAMERA }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith('20240001'));
    // Câmera desligada assim que leu: nada de stream aberto durante a venda inteira.
    expect(stream.track.stop).toHaveBeenCalled();
  });

  it('fora de HTTPS explica o motivo em vez de "erro ao abrir"', async () => {
    const user = userEvent.setup();
    contextoSeguro(false);
    const getUserMedia = vi.fn();
    darCamera(getUserMedia);

    render(<CodeScanner label="Carteira do comprador" onSubmit={vi.fn()} />);
    await user.click(await screen.findByRole('button', { name: BOTAO_CAMERA }));

    expect(screen.getByRole('status')).toHaveTextContent(/só funciona em HTTPS/);
    expect(getUserMedia).not.toHaveBeenCalled();
  });

  it('permissão negada tem mensagem própria', async () => {
    const user = userEvent.setup();
    darCamera(async () => {
      throw new DOMException('negado', 'NotAllowedError');
    });

    render(<CodeScanner label="Carteira do comprador" onSubmit={vi.fn()} />);
    await user.click(await screen.findByRole('button', { name: BOTAO_CAMERA }));

    expect(await screen.findByRole('status')).toHaveTextContent(/Permissão de câmera negada/);
  });

  it('digitação manual continua funcionando', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    darCamera(async () => faseStream());

    render(<CodeScanner label="Carteira do comprador" submitLabel="Buscar" onSubmit={onSubmit} />);
    await user.type(screen.getByLabelText('Carteira do comprador'), '20240002');
    await user.click(screen.getByRole('button', { name: 'Buscar' }));

    expect(onSubmit).toHaveBeenCalledWith('20240002');
  });
});
