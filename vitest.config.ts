import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

// Alias "@/..." -> "src/..." (mesmo do tsconfig), sem depender de plugin extra.
const alias = {
  '@': fileURLToPath(new URL('./src', import.meta.url)),
};

// Carrega .env.test (se existir) já na avaliação do config, para que a DATABASE_URL de
// teste seja injetada nos workers ANTES de qualquer import do Prisma singleton.
// Integração/e2e usam essa URL; unit/components não tocam banco e ignoram.
try {
  process.loadEnvFile('.env.test');
} catch {
  // .env.test ausente: integração/e2e serão puladas (ver tests/helpers/db.ts).
}

const DATABASE_URL = process.env.DATABASE_URL ?? '';

// Config compartilhada dos projetos que usam banco real.
const dbProject = (name: string, include: string[]) => ({
  resolve: { alias },
  test: {
    name,
    include,
    environment: 'node' as const,
    env: { DATABASE_URL },
    globalSetup: ['tests/helpers/global-setup.ts'],
    setupFiles: ['tests/helpers/db-setup.ts'],
    // Um único processo, arquivos em série: todos compartilham o mesmo banco de teste e
    // dão TRUNCATE no beforeEach. Rodar arquivos em paralelo faria um truncar os dados do
    // outro. (A concorrência que testamos é entre PROMISES dentro de um teste, não entre
    // arquivos.)
    pool: 'forks' as const,
    poolOptions: { forks: { singleFork: true } },
    hookTimeout: 30_000,
  },
});

export default defineConfig({
  resolve: { alias },
  test: {
    projects: [
      {
        resolve: { alias },
        test: {
          name: 'unit',
          include: ['tests/unit/**/*.test.ts'],
          environment: 'node',
        },
      },
      {
        // Testes de componente (React) — DOM leve (happy-dom), sem banco.
        plugins: [react()],
        resolve: { alias },
        test: {
          name: 'components',
          include: ['tests/components/**/*.test.tsx'],
          environment: 'happy-dom',
          setupFiles: ['tests/helpers/component-setup.ts'],
        },
      },
      dbProject('integration', ['tests/integration/**/*.test.ts']),
      dbProject('e2e', ['tests/e2e/**/*.test.ts']),
    ],
  },
});
