-- Vínculo com provedor externo de identidade (Google). Fica atrás de GOOGLE_AUTH_ENABLED.
CREATE TABLE "contas_externas" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "provider_account_id" TEXT NOT NULL,
    "email" TEXT,
    "user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contas_externas_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "contas_externas_provider_provider_account_id_key" ON "contas_externas"("provider", "provider_account_id");
CREATE INDEX "contas_externas_user_id_idx" ON "contas_externas"("user_id");

ALTER TABLE "contas_externas" ADD CONSTRAINT "contas_externas_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
