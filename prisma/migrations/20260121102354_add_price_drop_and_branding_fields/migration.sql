-- AlterTable
ALTER TABLE "BackInStock" ADD COLUMN "priceAtSubscription" TEXT;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_AppSettings" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "shop" TEXT NOT NULL,
    "adminEmail" TEXT NOT NULL DEFAULT 'digittrix.savita@gmail.com',
    "subjectLine" TEXT NOT NULL DEFAULT 'Out of stock products reminder',
    "includeSku" BOOLEAN NOT NULL DEFAULT true,
    "includeVendor" BOOLEAN NOT NULL DEFAULT true,
    "includePrice" BOOLEAN NOT NULL DEFAULT false,
    "includeTags" BOOLEAN NOT NULL DEFAULT false,
    "updateViaEmail" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" DATETIME NOT NULL,
    "countdownThreshold" INTEGER NOT NULL DEFAULT 200,
    "emailLimitPerRestock" INTEGER NOT NULL DEFAULT 100,
    "enablePriceDropAlerts" BOOLEAN NOT NULL DEFAULT true,
    "priceDropThreshold" INTEGER NOT NULL DEFAULT 5
);
INSERT INTO "new_AppSettings" ("adminEmail", "id", "includePrice", "includeSku", "includeTags", "includeVendor", "shop", "subjectLine", "updateViaEmail", "updatedAt") SELECT "adminEmail", "id", "includePrice", "includeSku", "includeTags", "includeVendor", "shop", "subjectLine", "updateViaEmail", "updatedAt" FROM "AppSettings";
DROP TABLE "AppSettings";
ALTER TABLE "new_AppSettings" RENAME TO "AppSettings";
CREATE UNIQUE INDEX "AppSettings_shop_key" ON "AppSettings"("shop");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
