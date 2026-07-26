import { execSync } from 'node:child_process';

/**
 * Antes do e2e de UI: aplica migrations e faz um seed determinístico (SEED_RESET zera
 * as tabelas) no banco de teste, para que cada run comece do mesmo estado conhecido.
 */
export default function globalSetup() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error('DATABASE_URL não definido (.env.test). Suba o banco: npm run db:test:up');
  }
  const env = { ...process.env, DATABASE_URL: url };
  execSync('npx prisma migrate deploy', { stdio: 'pipe', env });
  execSync('node prisma/seed.mjs', { stdio: 'inherit', env: { ...env, SEED_RESET: '1' } });
}
