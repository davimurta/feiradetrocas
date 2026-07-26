-- CreateEnum
CREATE TYPE "Papel" AS ENUM ('participante', 'atendente_entrada', 'atendente_stand', 'admin');

-- CreateEnum
CREATE TYPE "Unidade" AS ENUM ('barroca', 'floresta');

-- CreateEnum
CREATE TYPE "TipoTransacao" AS ENUM ('credito_entrada', 'debito_compra', 'ajuste_manual');

-- CreateEnum
CREATE TYPE "PedidoStatus" AS ENUM ('pendente', 'aprovado', 'recusado', 'cancelado');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "senha_hash" TEXT,
    "provider" TEXT NOT NULL DEFAULT 'password',
    "papel" "Papel" NOT NULL DEFAULT 'participante',
    "unidade" "Unidade" NOT NULL DEFAULT 'barroca',
    "saldo" INTEGER NOT NULL DEFAULT 0,
    "codigo_carteira" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "items" (
    "id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "categoria" TEXT NOT NULL,
    "valor" INTEGER NOT NULL,
    "quantidade" INTEGER NOT NULL DEFAULT 0,
    "unidade" "Unidade" NOT NULL DEFAULT 'barroca',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transacoes" (
    "id" TEXT NOT NULL,
    "tipo" "TipoTransacao" NOT NULL,
    "valor" INTEGER NOT NULL,
    "quantidade" INTEGER NOT NULL DEFAULT 1,
    "user_id" TEXT NOT NULL,
    "atendente_id" TEXT,
    "item_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "transacoes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pedidos" (
    "id" TEXT NOT NULL,
    "status" "PedidoStatus" NOT NULL DEFAULT 'pendente',
    "valor" INTEGER NOT NULL,
    "quantidade" INTEGER NOT NULL DEFAULT 1,
    "item_id" TEXT NOT NULL,
    "comprador_id" TEXT NOT NULL,
    "atendente_id" TEXT NOT NULL,
    "aprovado_comprador" BOOLEAN NOT NULL DEFAULT false,
    "aprovado_atendente" BOOLEAN NOT NULL DEFAULT true,
    "transacao_id" TEXT,
    "motivo_recusa" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pedidos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_codigo_carteira_key" ON "users"("codigo_carteira");

-- CreateIndex
CREATE UNIQUE INDEX "items_codigo_key" ON "items"("codigo");

-- CreateIndex
CREATE INDEX "items_categoria_unidade_idx" ON "items"("categoria", "unidade");

-- CreateIndex
CREATE UNIQUE INDEX "items_nome_valor_unidade_key" ON "items"("nome", "valor", "unidade");

-- CreateIndex
CREATE INDEX "transacoes_user_id_created_at_idx" ON "transacoes"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "transacoes_item_id_idx" ON "transacoes"("item_id");

-- CreateIndex
CREATE UNIQUE INDEX "pedidos_transacao_id_key" ON "pedidos"("transacao_id");

-- CreateIndex
CREATE INDEX "pedidos_comprador_id_status_idx" ON "pedidos"("comprador_id", "status");

-- CreateIndex
CREATE INDEX "pedidos_status_created_at_idx" ON "pedidos"("status", "created_at");

-- AddForeignKey
ALTER TABLE "transacoes" ADD CONSTRAINT "transacoes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transacoes" ADD CONSTRAINT "transacoes_atendente_id_fkey" FOREIGN KEY ("atendente_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transacoes" ADD CONSTRAINT "transacoes_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pedidos" ADD CONSTRAINT "pedidos_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pedidos" ADD CONSTRAINT "pedidos_comprador_id_fkey" FOREIGN KEY ("comprador_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pedidos" ADD CONSTRAINT "pedidos_atendente_id_fkey" FOREIGN KEY ("atendente_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pedidos" ADD CONSTRAINT "pedidos_transacao_id_fkey" FOREIGN KEY ("transacao_id") REFERENCES "transacoes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
