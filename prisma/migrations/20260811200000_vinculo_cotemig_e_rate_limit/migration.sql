-- Vínculo com o portal do Cotemig, provado uma vez no cadastro.
ALTER TABLE "users" ADD COLUMN "cotemig_id" TEXT;
ALTER TABLE "users" ADD COLUMN "cotemig_usuario" TEXT;
ALTER TABLE "users" ADD COLUMN "vinculado_em" TIMESTAMP(3);

CREATE UNIQUE INDEX "users_cotemig_id_key" ON "users"("cotemig_id");

-- Auditoria das tentativas de autenticação.
CREATE TABLE "tentativas_auth" (
    "id" TEXT NOT NULL,
    "escopo" TEXT NOT NULL,
    "identificador" TEXT NOT NULL,
    "ip" TEXT,
    "sucesso" BOOLEAN NOT NULL,
    "motivo" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tentativas_auth_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "tentativas_auth_escopo_identificador_created_at_idx" ON "tentativas_auth"("escopo", "identificador", "created_at");
CREATE INDEX "tentativas_auth_created_at_idx" ON "tentativas_auth"("created_at");

-- Baldes de rate limiting.
CREATE TABLE "baldes_rate" (
    "chave" TEXT NOT NULL,
    "escopo" TEXT NOT NULL,
    "falhas" INTEGER NOT NULL DEFAULT 0,
    "janela_inicio" TIMESTAMP(3) NOT NULL,
    "bloqueado_ate" TIMESTAMP(3),
    "atualizado_em" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "baldes_rate_pkey" PRIMARY KEY ("chave")
);

CREATE INDEX "baldes_rate_atualizado_em_idx" ON "baldes_rate"("atualizado_em");
