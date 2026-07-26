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
    command: `npm run build && npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: false,
    timeout: 180_000,
    env: { DATABASE_URL, PORT: String(PORT) },
  },
});
