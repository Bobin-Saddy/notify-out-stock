/*
  Warnings:

  - You are about to drop the column `priceAtSubscription` on the `BackInStock` table. All the data in the column will be lost.

*/
-- CreateTable
CREATE TABLE "Wishlist" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "shop" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "productTitle" TEXT NOT NULL,
    "variantTitle" TEXT,
    "productImage" TEXT,
    "productHandle" TEXT,
    "price" REAL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_BackInStock" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "shop" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "inventoryItemId" TEXT,
    "productId" TEXT,
    "productTitle" TEXT,
    "variantTitle" TEXT,
    "notified" BOOLEAN NOT NULL DEFAULT false,
    "opened" BOOLEAN NOT NULL DEFAULT false,
    "clicked" BOOLEAN NOT NULL DEFAULT false,
    "purchased" BOOLEAN NOT NULL DEFAULT false,
    "subscribedPrice" REAL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_BackInStock" ("clicked", "createdAt", "email", "id", "inventoryItemId", "notified", "opened", "productId", "productTitle", "purchased", "shop", "subscribedPrice", "updatedAt", "variantId", "variantTitle") SELECT "clicked", "createdAt", "email", "id", "inventoryItemId", "notified", "opened", "productId", "productTitle", "purchased", "shop", "subscribedPrice", "updatedAt", "variantId", "variantTitle" FROM "BackInStock";
DROP TABLE "BackInStock";
ALTER TABLE "new_BackInStock" RENAME TO "BackInStock";
CREATE INDEX "BackInStock_shop_inventoryItemId_idx" ON "BackInStock"("shop", "inventoryItemId");
CREATE INDEX "BackInStock_shop_variantId_idx" ON "BackInStock"("shop", "variantId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "Wishlist_shop_email_idx" ON "Wishlist"("shop", "email");

-- CreateIndex
CREATE INDEX "Wishlist_productId_idx" ON "Wishlist"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "Wishlist_shop_email_productId_key" ON "Wishlist"("shop", "email", "productId");
