-- Versão de sessão: vai assinada no cookie e é comparada com o banco a cada requisição.
-- Incrementar a coluna invalida todos os cookies emitidos para aquele usuário.
ALTER TABLE "users" ADD COLUMN "session_version" INTEGER NOT NULL DEFAULT 0;
