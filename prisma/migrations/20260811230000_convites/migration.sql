-- Convites para quem não tem matrícula no Cotemig. Multiuso, com validade.
CREATE TABLE "convites" (
    "id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "descricao" TEXT,
    "unidade" "Unidade" NOT NULL,
    "expira_em" TIMESTAMP(3) NOT NULL,
    "max_usos" INTEGER,
    "usos" INTEGER NOT NULL DEFAULT 0,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criado_por_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "convites_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "convites_codigo_key" ON "convites"("codigo");
CREATE INDEX "convites_ativo_expira_em_idx" ON "convites"("ativo", "expira_em");

ALTER TABLE "convites" ADD CONSTRAINT "convites_criado_por_id_fkey"
  FOREIGN KEY ("criado_por_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "users" ADD COLUMN "convite_id" TEXT;

ALTER TABLE "users" ADD CONSTRAINT "users_convite_id_fkey"
  FOREIGN KEY ("convite_id") REFERENCES "convites"("id") ON DELETE SET NULL ON UPDATE CASCADE;
