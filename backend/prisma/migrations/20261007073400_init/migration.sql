-- CreateEnum
CREATE TYPE "Role" AS ENUM ('OWNER', 'CASHIER', 'WAREHOUSE', 'DELIVERY');

-- CreateEnum
CREATE TYPE "ItemKind" AS ENUM ('RAW', 'PACK', 'BUNDLE', 'MATERIAL');

-- CreateEnum
CREATE TYPE "BatchKind" AS ENUM ('RECEIPT', 'PACK');

-- CreateEnum
CREATE TYPE "BatchStatus" AS ENUM ('ACTIVE', 'HOLD');

-- CreateEnum
CREATE TYPE "LedgerReason" AS ENUM ('RECEIPT', 'PACK_IN', 'PACK_OUT', 'SALE', 'RETURN', 'ADJUST', 'COUNT');

-- CreateEnum
CREATE TYPE "PaymentMode" AS ENUM ('CREDIT', 'CASH', 'UPI');

-- CreateEnum
CREATE TYPE "StockCountStatus" AS ENUM ('OPEN', 'CLOSED');

-- CreateTable
CREATE TABLE "user" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "roles" "Role"[],
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_log" (
    "id" TEXT NOT NULL,
    "ts" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "beforeJson" JSONB,
    "afterJson" JSONB,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tax_class" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "hsn" TEXT,

    CONSTRAINT "tax_class_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tax_rate" (
    "id" TEXT NOT NULL,
    "taxClassId" TEXT NOT NULL,
    "ratePct" DECIMAL(5,2) NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tax_rate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "item" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "size" TEXT,
    "unit" TEXT NOT NULL,
    "ean13" TEXT,
    "taxClassId" TEXT,
    "mrpPaise" INTEGER,
    "shelfLifeDays" INTEGER,
    "reorderLevel" INTEGER,
    "trackBatches" BOOLEAN NOT NULL DEFAULT true,
    "kind" "ItemKind" NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "uom_conversion" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "fromUnit" TEXT NOT NULL,
    "toUnit" TEXT NOT NULL,
    "factor" DECIMAL(12,6) NOT NULL,

    CONSTRAINT "uom_conversion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bundle_component" (
    "bundleItemId" TEXT NOT NULL,
    "componentItemId" TEXT NOT NULL,
    "qty" DECIMAL(12,3) NOT NULL,

    CONSTRAINT "bundle_component_pkey" PRIMARY KEY ("bundleItemId","componentItemId")
);

-- CreateTable
CREATE TABLE "document_series" (
    "id" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "nextNo" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "document_series_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supplier" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "gstin" TEXT,

    CONSTRAINT "supplier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "batch" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "kind" "BatchKind" NOT NULL,
    "supplierId" TEXT,
    "supplierLot" TEXT,
    "receivedOn" TIMESTAMP(3),
    "mfgDate" TIMESTAMP(3),
    "bestBefore" TIMESTAMP(3),
    "status" "BatchStatus" NOT NULL DEFAULT 'ACTIVE',

    CONSTRAINT "batch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "batch_genealogy" (
    "childBatchId" TEXT NOT NULL,
    "parentBatchId" TEXT NOT NULL,
    "qtyConsumed" DECIMAL(12,3) NOT NULL,

    CONSTRAINT "batch_genealogy_pkey" PRIMARY KEY ("childBatchId","parentBatchId")
);

-- CreateTable
CREATE TABLE "stock_ledger" (
    "id" TEXT NOT NULL,
    "ts" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "itemId" TEXT NOT NULL,
    "batchId" TEXT,
    "qtyDelta" DECIMAL(12,3) NOT NULL,
    "reason" "LedgerReason" NOT NULL,
    "refType" TEXT NOT NULL,
    "refId" TEXT NOT NULL,
    "unitCostPaise" INTEGER,

    CONSTRAINT "stock_ledger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_balance" (
    "itemId" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "qty" DECIMAL(12,3) NOT NULL,

    CONSTRAINT "stock_balance_pkey" PRIMARY KEY ("itemId","batchId")
);

-- CreateTable
CREATE TABLE "item_cost" (
    "itemId" TEXT NOT NULL,
    "avgCostPaise" INTEGER NOT NULL,
    "qtyOnHand" DECIMAL(12,3) NOT NULL,

    CONSTRAINT "item_cost_pkey" PRIMARY KEY ("itemId")
);

-- CreateTable
CREATE TABLE "goods_receipt" (
    "id" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "supplierBillNo" TEXT NOT NULL,
    "billDate" TIMESTAMP(3) NOT NULL,
    "paymentMode" "PaymentMode" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "goods_receipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "goods_receipt_line" (
    "id" TEXT NOT NULL,
    "receiptId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "receivedAs" TEXT,
    "qtyBase" DECIMAL(12,3) NOT NULL,
    "ratePaise" INTEGER NOT NULL,
    "taxRateSnapshot" DECIMAL(5,2) NOT NULL,
    "amountPaise" INTEGER NOT NULL,
    "batchId" TEXT,

    CONSTRAINT "goods_receipt_line_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_count" (
    "id" TEXT NOT NULL,
    "ts" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "StockCountStatus" NOT NULL DEFAULT 'OPEN',

    CONSTRAINT "stock_count_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_count_line" (
    "id" TEXT NOT NULL,
    "countId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "batchId" TEXT,
    "countedQty" DECIMAL(12,3) NOT NULL,
    "systemQty" DECIMAL(12,3) NOT NULL,

    CONSTRAINT "stock_count_line_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_email_key" ON "user"("email");

-- CreateIndex
CREATE INDEX "audit_log_entity_entityId_idx" ON "audit_log"("entity", "entityId");

-- CreateIndex
CREATE UNIQUE INDEX "tax_class_name_key" ON "tax_class"("name");

-- CreateIndex
CREATE INDEX "tax_rate_taxClassId_effectiveFrom_idx" ON "tax_rate"("taxClassId", "effectiveFrom");

-- CreateIndex
CREATE UNIQUE INDEX "item_code_key" ON "item"("code");

-- CreateIndex
CREATE UNIQUE INDEX "document_series_prefix_key" ON "document_series"("prefix");

-- CreateIndex
CREATE UNIQUE INDEX "batch_code_key" ON "batch"("code");

-- CreateIndex
CREATE INDEX "batch_itemId_bestBefore_idx" ON "batch"("itemId", "bestBefore");

-- CreateIndex
CREATE INDEX "stock_ledger_itemId_batchId_idx" ON "stock_ledger"("itemId", "batchId");

-- CreateIndex
CREATE INDEX "stock_ledger_refType_refId_idx" ON "stock_ledger"("refType", "refId");

-- AddForeignKey
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tax_rate" ADD CONSTRAINT "tax_rate_taxClassId_fkey" FOREIGN KEY ("taxClassId") REFERENCES "tax_class"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "item" ADD CONSTRAINT "item_taxClassId_fkey" FOREIGN KEY ("taxClassId") REFERENCES "tax_class"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "uom_conversion" ADD CONSTRAINT "uom_conversion_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bundle_component" ADD CONSTRAINT "bundle_component_bundleItemId_fkey" FOREIGN KEY ("bundleItemId") REFERENCES "item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bundle_component" ADD CONSTRAINT "bundle_component_componentItemId_fkey" FOREIGN KEY ("componentItemId") REFERENCES "item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "batch" ADD CONSTRAINT "batch_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "batch" ADD CONSTRAINT "batch_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "batch_genealogy" ADD CONSTRAINT "batch_genealogy_childBatchId_fkey" FOREIGN KEY ("childBatchId") REFERENCES "batch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "batch_genealogy" ADD CONSTRAINT "batch_genealogy_parentBatchId_fkey" FOREIGN KEY ("parentBatchId") REFERENCES "batch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_ledger" ADD CONSTRAINT "stock_ledger_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_ledger" ADD CONSTRAINT "stock_ledger_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "batch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_balance" ADD CONSTRAINT "stock_balance_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_balance" ADD CONSTRAINT "stock_balance_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "batch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "item_cost" ADD CONSTRAINT "item_cost_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goods_receipt" ADD CONSTRAINT "goods_receipt_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goods_receipt_line" ADD CONSTRAINT "goods_receipt_line_receiptId_fkey" FOREIGN KEY ("receiptId") REFERENCES "goods_receipt"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goods_receipt_line" ADD CONSTRAINT "goods_receipt_line_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goods_receipt_line" ADD CONSTRAINT "goods_receipt_line_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "batch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_count_line" ADD CONSTRAINT "stock_count_line_countId_fkey" FOREIGN KEY ("countId") REFERENCES "stock_count"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_count_line" ADD CONSTRAINT "stock_count_line_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_count_line" ADD CONSTRAINT "stock_count_line_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "batch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
