-- CreateTable
CREATE TABLE "AppSettings" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "shop" TEXT NOT NULL,
    "adminEmail" TEXT NOT NULL DEFAULT 'digittrix.savita@gmail.com',
    "subjectLine" TEXT NOT NULL DEFAULT 'Out of stock products reminder',
    "includeSku" BOOLEAN NOT NULL DEFAULT true,
    "includeVendor" BOOLEAN NOT NULL DEFAULT true,
    "includePrice" BOOLEAN NOT NULL DEFAULT false,
    "includeTags" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "AppSettings_shop_key" ON "AppSettings"("shop");
