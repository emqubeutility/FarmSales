-- CreateEnum
CREATE TYPE "Channel" AS ENUM ('WALK_IN', 'PHONE', 'ONLINE');

-- CreateEnum
CREATE TYPE "SalesPoint" AS ENUM ('MARKET_STALL', 'WAREHOUSE_COUNTER');

-- CreateEnum
CREATE TYPE "SaleStatus" AS ENUM ('HELD', 'FINALIZED', 'VOID');

-- CreateEnum
CREATE TYPE "SalePaymentMode" AS ENUM ('CASH', 'UPI', 'CREDIT_NOTE', 'B2B_CREDIT');


-- CreateTable
CREATE TABLE "pack_recipe" (
    "id" TEXT NOT NULL,
    "packItemId" TEXT NOT NULL,
    "rawItemId" TEXT NOT NULL,
    "qtyPerPack" DECIMAL(12,4) NOT NULL,

    CONSTRAINT "pack_recipe_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pack_recipe_material" (
    "id" TEXT NOT NULL,
    "recipeId" TEXT NOT NULL,
    "materialItemId" TEXT NOT NULL,
    "qtyPerPack" DECIMAL(12,4) NOT NULL,

    CONSTRAINT "pack_recipe_material_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "packing_run" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "packItemId" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "packing_run_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "packing_input" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "qty" DECIMAL(12,3) NOT NULL,

    CONSTRAINT "packing_input_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "packing_output" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "qty" DECIMAL(12,3) NOT NULL,

    CONSTRAINT "packing_output_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "packing_wastage" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "qty" DECIMAL(12,3) NOT NULL,

    CONSTRAINT "packing_wastage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "channel_discount" (
    "channel" "Channel" NOT NULL,
    "defaultPct" DECIMAL(5,2) NOT NULL,
    "maxPct" DECIMAL(5,2) NOT NULL,

    CONSTRAINT "channel_discount_pkey" PRIMARY KEY ("channel")
);

-- CreateTable
CREATE TABLE "sale" (
    "id" TEXT NOT NULL,
    "number" TEXT,
    "salesPoint" "SalesPoint" NOT NULL,
    "channel" "Channel" NOT NULL,
    "status" "SaleStatus" NOT NULL DEFAULT 'HELD',
    "discountPct" DECIMAL(5,2) NOT NULL,
    "grossPaise" INTEGER,
    "discountPaise" INTEGER,
    "netPaise" INTEGER,
    "taxablePaise" INTEGER,
    "taxPaise" INTEGER,
    "roundOffPaise" INTEGER,
    "totalPaise" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finalizedAt" TIMESTAMP(3),

    CONSTRAINT "sale_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sale_line" (
    "id" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "qty" DECIMAL(12,3) NOT NULL,
    "mrpPaise" INTEGER NOT NULL,
    "taxRatePct" DECIMAL(5,2) NOT NULL,

    CONSTRAINT "sale_line_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sale_line_batch" (
    "id" TEXT NOT NULL,
    "saleLineId" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "qty" DECIMAL(12,3) NOT NULL,

    CONSTRAINT "sale_line_batch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment" (
    "id" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "mode" "SalePaymentMode" NOT NULL,
    "amountPaise" INTEGER NOT NULL,
    "reference" TEXT,

    CONSTRAINT "payment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "pack_recipe_packItemId_key" ON "pack_recipe"("packItemId");

-- CreateIndex
CREATE UNIQUE INDEX "packing_run_code_key" ON "packing_run"("code");

-- CreateIndex
CREATE UNIQUE INDEX "packing_output_batchId_key" ON "packing_output"("batchId");

-- CreateIndex
CREATE UNIQUE INDEX "sale_number_key" ON "sale"("number");

-- AddForeignKey
ALTER TABLE "pack_recipe" ADD CONSTRAINT "pack_recipe_packItemId_fkey" FOREIGN KEY ("packItemId") REFERENCES "item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pack_recipe" ADD CONSTRAINT "pack_recipe_rawItemId_fkey" FOREIGN KEY ("rawItemId") REFERENCES "item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pack_recipe_material" ADD CONSTRAINT "pack_recipe_material_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "pack_recipe"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pack_recipe_material" ADD CONSTRAINT "pack_recipe_material_materialItemId_fkey" FOREIGN KEY ("materialItemId") REFERENCES "item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "packing_run" ADD CONSTRAINT "packing_run_packItemId_fkey" FOREIGN KEY ("packItemId") REFERENCES "item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "packing_input" ADD CONSTRAINT "packing_input_runId_fkey" FOREIGN KEY ("runId") REFERENCES "packing_run"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "packing_input" ADD CONSTRAINT "packing_input_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "batch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "packing_output" ADD CONSTRAINT "packing_output_runId_fkey" FOREIGN KEY ("runId") REFERENCES "packing_run"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "packing_output" ADD CONSTRAINT "packing_output_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "batch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "packing_wastage" ADD CONSTRAINT "packing_wastage_runId_fkey" FOREIGN KEY ("runId") REFERENCES "packing_run"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "packing_wastage" ADD CONSTRAINT "packing_wastage_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "batch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_line" ADD CONSTRAINT "sale_line_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "sale"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_line" ADD CONSTRAINT "sale_line_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_line_batch" ADD CONSTRAINT "sale_line_batch_saleLineId_fkey" FOREIGN KEY ("saleLineId") REFERENCES "sale_line"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_line_batch" ADD CONSTRAINT "sale_line_batch_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "batch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment" ADD CONSTRAINT "payment_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "sale"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

