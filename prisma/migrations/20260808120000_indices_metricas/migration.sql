-- CreateIndex
CREATE INDEX "transacoes_created_at_idx" ON "transacoes"("created_at");

-- CreateIndex
CREATE INDEX "transacoes_tipo_created_at_idx" ON "transacoes"("tipo", "created_at");

-- CreateIndex
CREATE INDEX "transacoes_atendente_id_created_at_idx" ON "transacoes"("atendente_id", "created_at");

-- CreateIndex
CREATE INDEX "pedidos_atendente_id_status_idx" ON "pedidos"("atendente_id", "status");

-- CreateIndex
CREATE INDEX "itens_pendentes_atendente_id_created_at_idx" ON "itens_pendentes"("atendente_id", "created_at");
