import { defineConfig, devices } from '@playwright/test';

// E2E de UI: browser real (Chromium) contra o app rodando no banco de TESTE (feira_test).
// Carrega .env.test para descobrir a DATABASE_URL de teste e injeta no servidor e no setup.
try {
  process.loadEnvFile('.env.test');
} catch {
  /* .env.test ausente — o webServer/seed vão falhar com mensagem clara */
}

const DATABASE_URL = process.env.DATABASE_URL ?? '';
const PORT = 3210;

export default defineConfig({
  testDir: './tests/e2e-ui',
  testMatch: '**/*.spec.ts',
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  globalSetup: './tests/e2e-ui/global-setup.ts',
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    // Build + start apontando para o banco de teste. @next/env não sobrescreve variáveis
    // já presentes em process.env, então esta DATABASE_URL (feira_test) vence a do .env.
    // `next start` não serve o build `output: 'standalone'` (só avisa e serve por acaso).
    // Rodamos o próprio server.js do standalone — o mesmo binário que roda em produção —
    // depois de colocar `public/` e `.next/static` onde ele os procura.
    command: `npm run build && cp -r public .next/standalone/ && cp -r .next/static .next/standalone/.next/ && node .next/standalone/server.js`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: false,
    timeout: 180_000,
    env: { DATABASE_URL, PORT: String(PORT) },
  },
});
