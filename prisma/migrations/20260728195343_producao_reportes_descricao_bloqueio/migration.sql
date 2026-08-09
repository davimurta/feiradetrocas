-- CreateEnum
CREATE TYPE "ItemPendenteStatus" AS ENUM ('pendente', 'producao');

-- AlterTable
ALTER TABLE "items" ADD COLUMN     "descricao" TEXT;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "bloqueado" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "itens_pendentes" (
    "id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "categoria" TEXT NOT NULL,
    "valor" INTEGER NOT NULL,
    "quantidade" INTEGER NOT NULL DEFAULT 1,
    "unidade" "Unidade" NOT NULL DEFAULT 'barroca',
    "descricao" TEXT,
    "aluno_id" TEXT NOT NULL,
    "atendente_id" TEXT NOT NULL,
    "status" "ItemPendenteStatus" NOT NULL DEFAULT 'pendente',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "itens_pendentes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reportes" (
    "id" TEXT NOT NULL,
    "motivo" TEXT NOT NULL,
    "descricao" TEXT,
    "reportado_id" TEXT NOT NULL,
    "reportante_id" TEXT NOT NULL,
    "pedido_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reportes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "itens_pendentes_codigo_key" ON "itens_pendentes"("codigo");

-- CreateIndex
CREATE INDEX "itens_pendentes_status_unidade_created_at_idx" ON "itens_pendentes"("status", "unidade", "created_at");

-- CreateIndex
CREATE INDEX "reportes_created_at_idx" ON "reportes"("created_at");

-- AddForeignKey
ALTER TABLE "itens_pendentes" ADD CONSTRAINT "itens_pendentes_aluno_id_fkey" FOREIGN KEY ("aluno_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "itens_pendentes" ADD CONSTRAINT "itens_pendentes_atendente_id_fkey" FOREIGN KEY ("atendente_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reportes" ADD CONSTRAINT "reportes_reportado_id_fkey" FOREIGN KEY ("reportado_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reportes" ADD CONSTRAINT "reportes_reportante_id_fkey" FOREIGN KEY ("reportante_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
