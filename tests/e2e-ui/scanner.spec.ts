import { test, expect, type Page } from '@playwright/test';

async function login(page: Page, email: string, senha: string) {
  await page.goto('/login');
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Senha', { exact: true }).fill(senha);
  await page.getByRole('button', { name: 'Entrar' }).click();
}

test('stand lê o QR da carteira e acha o comprador', async ({ browser }) => {
  // 1) Captura o QR real da carteira do Bruno.
  const buyerCtx = await browser.newContext();
  const buyer = await buyerCtx.newPage();
  await login(buyer, '20240002@aluno.cotemig.com.br', 'aluno123');
  await buyer.getByRole('button', { name: /Exibir QRcode/ }).click();
  const qrPng = await buyer.getByRole('dialog', { name: 'Sua carteira' }).locator('svg').screenshot();
  const qrDataUrl = `data:image/png;base64,${qrPng.toString('base64')}`;
  await buyerCtx.close();

  // 2) Stand com uma "câmera" que filma exatamente esse QR.
  const standCtx = await browser.newContext();
  await standCtx.addInitScript((dataUrl) => {
    const img = new Image();
    img.src = dataUrl;
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: async () => {
          const canvas = document.createElement('canvas');
          canvas.width = 640;
          canvas.height = 640;
          const ctx = canvas.getContext('2d')!;
          const desenhar = () => {
            ctx.fillStyle = '#fff';
            ctx.fillRect(0, 0, 640, 640);
            if (img.complete) ctx.drawImage(img, 70, 70, 500, 500);
          };
          desenhar();
          setInterval(desenhar, 100);
          return (canvas as HTMLCanvasElement & { captureStream(fps: number): MediaStream })
            .captureStream(10);
        },
      },
    });
  }, qrDataUrl);

  const stand = await standCtx.newPage();
  await login(stand, 'stand.floresta@cotemig.com.br', 'stand123');
  await stand.getByRole('button', { name: 'Vender Fone de ouvido' }).click();

  const botaoCamera = stand.getByRole('button', { name: /Escanear QR code com a câmera/ });
  await expect(botaoCamera).toBeVisible();
  await botaoCamera.click();

  // A leitura preenche o campo e dispara a busca do comprador.
  await expect(stand.getByText(/Saldo: 50/)).toBeVisible({ timeout: 15000 });
  await expect(stand.getByText('Bruno Aluno')).toBeVisible();
  await stand.screenshot({ path: 'shot-scan.png' });

  await standCtx.close();
});
