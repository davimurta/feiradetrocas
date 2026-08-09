import { test, expect, type Page } from '@playwright/test';

/**
 * Fluxo crítico ponta a ponta com APROVAÇÃO EM DUAS PONTAS e UNIDADE:
 *   - stand da Floresta monta um pedido (item da Floresta) para o Bruno;
 *   - o Bruno aprova na carteira dele → débito;
 *   - o stand (polling) vê "Venda aprovada".
 * Também verifica o isolamento por unidade (o stand da Floresta não vê item da Barroca).
 * Usuários vêm do seed determinístico (global-setup).
 */

async function login(page: Page, email: string, senha: string) {
  await page.goto('/login');
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Senha', { exact: true }).fill(senha);
  await page.getByRole('button', { name: 'Entrar' }).click();
}

test('stand cria pedido → comprador aprova → saldo debita (unidade Floresta)', async ({ browser }) => {
  const standCtx = await browser.newContext();
  const buyerCtx = await browser.newContext();
  const stand = await standCtx.newPage();
  const buyer = await buyerCtx.newPage();

  // 1) Stand da Floresta monta o pedido de um item da Floresta para o Bruno (20240002).
  await login(stand, 'stand.floresta@cotemig.com.br', 'stand123');
  await expect(stand.getByRole('heading', { name: 'Stand · Caixa' })).toBeVisible();

  // Isolamento de unidade: item da Barroca não aparece no stand da Floresta.
  await expect(stand.getByRole('button', { name: /Vender Livro de Matemática/ })).toHaveCount(0);

  await stand.getByRole('button', { name: 'Vender Fone de ouvido' }).click();
  await stand.getByLabel(/Carteira do comprador/).fill('20240002');
  await stand.getByRole('button', { name: 'Buscar' }).click();
  await expect(stand.getByText(/Saldo: 50/)).toBeVisible();
  await stand.getByRole('button', { name: /Enviar para aprovação/ }).click();
  await expect(stand.getByRole('heading', { name: 'Aguardando aprovação' })).toBeVisible();

  // 2) Bruno aprova na carteira dele — tela cheia de aprovação (Aceitar/Recusar).
  await login(buyer, '20240002@aluno.cotemig.com.br', 'aluno123');
  await expect(buyer.getByRole('dialog', { name: /Aprovar compra/ })).toBeVisible();
  await expect(buyer.getByText('Fone de ouvido')).toBeVisible();
  await buyer.getByRole('button', { name: /Aceitar/ }).click();
  await expect(buyer.getByTestId('saldo-valor')).toHaveText('45'); // 50 - 5

  // 3) O stand (polling) reflete a aprovação.
  await expect(stand.getByRole('heading', { name: 'Venda aprovada' })).toBeVisible({ timeout: 8000 });

  await standCtx.close();
  await buyerCtx.close();
});
