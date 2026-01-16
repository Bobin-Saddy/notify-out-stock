-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_BackInStock" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "shop" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "inventoryItemId" TEXT,
    "notified" BOOLEAN NOT NULL DEFAULT false,
    "opened" BOOLEAN NOT NULL DEFAULT false,
    "clicked" BOOLEAN NOT NULL DEFAULT false,
    "purchased" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_BackInStock" ("createdAt", "email", "id", "inventoryItemId", "notified", "shop", "updatedAt", "variantId") SELECT "createdAt", "email", "id", "inventoryItemId", "notified", "shop", "updatedAt", "variantId" FROM "BackInStock";
DROP TABLE "BackInStock";
ALTER TABLE "new_BackInStock" RENAME TO "BackInStock";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
