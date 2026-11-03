-- Product clean-up: the shop sells ready-made products only.
-- 1) Clear test sales, stock, receipts, packing and pack labels (a backup was taken first).
TRUNCATE TABLE
  "stock_count_line", "stock_count", "stock_ledger", "stock_balance", "item_cost",
  "order_line_batch", "order_line", "order", "payment", "return_line", "return",
  "sale_line_batch", "sale_line", "sale", "credit_note", "pack_unit",
  "goods_receipt_line", "goods_receipt", "batch_genealogy", "packing_wastage",
  "packing_input", "packing_output", "packing_run", "batch", "supplier",
  "bundle_component", "uom_conversion", "pack_recipe_material", "pack_recipe"
RESTART IDENTITY;

-- 2) Keep only the finished products. Raw ingredients, packaging, bundles and demo items go.
DELETE FROM "item" WHERE "kind" <> 'PACK' OR "code" LIKE 'DEMO%';

-- 3) The packing number series is no longer used.
DELETE FROM "document_series" WHERE "prefix" = 'PK-';

-- 4) Schema change (generated from prisma/schema.prisma).
-- AlterEnum
BEGIN;
CREATE TYPE "LedgerReason_new" AS ENUM ('RECEIPT', 'SALE', 'RETURN', 'ADJUST', 'COUNT');
ALTER TABLE "stock_ledger" ALTER COLUMN "reason" TYPE "LedgerReason_new" USING ("reason"::text::"LedgerReason_new");
ALTER TYPE "LedgerReason" RENAME TO "LedgerReason_old";
ALTER TYPE "LedgerReason_new" RENAME TO "LedgerReason";
DROP TYPE "LedgerReason_old";
COMMIT;

-- DropForeignKey
ALTER TABLE "batch_genealogy" DROP CONSTRAINT "batch_genealogy_childBatchId_fkey";

-- DropForeignKey
ALTER TABLE "batch_genealogy" DROP CONSTRAINT "batch_genealogy_parentBatchId_fkey";

-- DropForeignKey
ALTER TABLE "bundle_component" DROP CONSTRAINT "bundle_component_bundleItemId_fkey";

-- DropForeignKey
ALTER TABLE "bundle_component" DROP CONSTRAINT "bundle_component_componentItemId_fkey";

-- DropForeignKey
ALTER TABLE "pack_recipe" DROP CONSTRAINT "pack_recipe_packItemId_fkey";

-- DropForeignKey
ALTER TABLE "pack_recipe" DROP CONSTRAINT "pack_recipe_rawItemId_fkey";

-- DropForeignKey
ALTER TABLE "pack_recipe_material" DROP CONSTRAINT "pack_recipe_material_materialItemId_fkey";

-- DropForeignKey
ALTER TABLE "pack_recipe_material" DROP CONSTRAINT "pack_recipe_material_recipeId_fkey";

-- DropForeignKey
ALTER TABLE "packing_input" DROP CONSTRAINT "packing_input_batchId_fkey";

-- DropForeignKey
ALTER TABLE "packing_input" DROP CONSTRAINT "packing_input_runId_fkey";

-- DropForeignKey
ALTER TABLE "packing_output" DROP CONSTRAINT "packing_output_batchId_fkey";

-- DropForeignKey
ALTER TABLE "packing_output" DROP CONSTRAINT "packing_output_runId_fkey";

-- DropForeignKey
ALTER TABLE "packing_run" DROP CONSTRAINT "packing_run_packItemId_fkey";

-- DropForeignKey
ALTER TABLE "packing_wastage" DROP CONSTRAINT "packing_wastage_batchId_fkey";

-- DropForeignKey
ALTER TABLE "packing_wastage" DROP CONSTRAINT "packing_wastage_runId_fkey";

-- DropForeignKey
ALTER TABLE "uom_conversion" DROP CONSTRAINT "uom_conversion_itemId_fkey";

-- AlterTable
ALTER TABLE "batch" DROP COLUMN "kind";

-- AlterTable
ALTER TABLE "item" DROP COLUMN "kind",
ADD COLUMN     "categoryId" TEXT;

DROP TABLE "batch_genealogy";

DROP TABLE "bundle_component";

DROP TABLE "pack_recipe";

DROP TABLE "pack_recipe_material";

DROP TABLE "packing_input";

DROP TABLE "packing_output";

DROP TABLE "packing_run";

DROP TABLE "packing_wastage";


DROP TABLE "uom_conversion";

-- DropEnum
DROP TYPE "BatchKind";

-- DropEnum
DROP TYPE "ItemKind";

-- CreateTable
CREATE TABLE "category" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "category_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "category_name_key" ON "category"("name");

-- AddForeignKey
ALTER TABLE "item" ADD CONSTRAINT "item_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

