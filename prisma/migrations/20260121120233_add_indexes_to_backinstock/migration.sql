-- CreateIndex
CREATE INDEX "BackInStock_shop_inventoryItemId_idx" ON "BackInStock"("shop", "inventoryItemId");

-- CreateIndex
CREATE INDEX "BackInStock_shop_variantId_idx" ON "BackInStock"("shop", "variantId");
