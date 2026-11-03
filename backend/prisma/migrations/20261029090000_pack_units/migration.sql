-- CreateEnum
CREATE TYPE "PackUnitStatus" AS ENUM ('IN_STOCK', 'RESERVED', 'SOLD');

-- AlterTable
ALTER TABLE "sale_line" ADD COLUMN     "batchId" TEXT;

-- CreateTable
CREATE TABLE "pack_unit" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "status" "PackUnitStatus" NOT NULL DEFAULT 'IN_STOCK',
    "consumedRef" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pack_unit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "pack_unit_code_key" ON "pack_unit"("code");

-- CreateIndex
CREATE INDEX "pack_unit_batchId_status_idx" ON "pack_unit"("batchId", "status");

-- CreateIndex
CREATE INDEX "pack_unit_consumedRef_idx" ON "pack_unit"("consumedRef");

-- AddForeignKey
ALTER TABLE "pack_unit" ADD CONSTRAINT "pack_unit_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pack_unit" ADD CONSTRAINT "pack_unit_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "batch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Backfill: one pack label per pack already in stock, so existing stock can be scanned.
-- Code = batch code + "-" + 4-digit number, e.g. BANSI500-261026A-0001.
INSERT INTO "pack_unit" ("id", "code", "itemId", "batchId", "status")
SELECT gen_random_uuid()::text, b."code" || '-' || lpad(gs.n::text, 4, '0'), b."itemId", b."id", 'IN_STOCK'::"PackUnitStatus"
FROM "batch" b
JOIN "item" i ON i."id" = b."itemId" AND i."kind" = 'PACK'
JOIN "stock_balance" sb ON sb."batchId" = b."id" AND sb."qty" > 0
JOIN LATERAL generate_series(1, sb."qty"::int) AS gs(n) ON true;
