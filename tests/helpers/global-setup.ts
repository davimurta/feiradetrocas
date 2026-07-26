import { execSync } from 'node:child_process';

/**
 * globalSetup dos projetos de banco (integration/e2e): roda UMA vez antes de tudo.
 * Aplica as migrations no banco de teste. Se o banco não estiver no ar, falha com uma
 * mensagem acionável em vez de erros crípticos de conexão espalhados pelos testes.
 */
export default function setup(): void {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.warn(
      '[tests] DATABASE_URL não definido (.env.test ausente) — testes de banco serão pulados.',
    );
    return;
  }

  try {
    execSync('npx prisma migrate deploy', {
      stdio: 'pipe',
      env: { ...process.env, DATABASE_URL: url },
    });
  } catch {
    throw new Error(
      `Não foi possível aplicar as migrations no banco de teste.\n` +
        `URL: ${url}\n` +
        `O Postgres de teste está no ar? Suba com:  npm run db:test:up`,
    );
  }
}
