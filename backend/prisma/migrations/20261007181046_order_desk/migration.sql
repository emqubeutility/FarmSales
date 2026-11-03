-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('NEW', 'PACKED', 'DISPATCHED', 'DELIVERED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "OrderPaymentPlan" AS ENUM ('PREPAID', 'COD', 'UPI_ON_DELIVERY');

-- CreateEnum
CREATE TYPE "DeliveryCollectionMode" AS ENUM ('CASH', 'UPI', 'ALREADY_PAID');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "Channel" ADD VALUE 'EMAIL';
ALTER TYPE "Channel" ADD VALUE 'SOCIAL';

-- AlterTable
ALTER TABLE "sale" ADD COLUMN     "deliveryChargePaise" INTEGER;


-- CreateTable
CREATE TABLE "order" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "channel" "Channel" NOT NULL,
    "salesPoint" "SalesPoint" NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'NEW',
    "paymentPlan" "OrderPaymentPlan" NOT NULL,
    "prepaidMode" "SalePaymentMode",
    "prepaidReference" TEXT,
    "customerId" TEXT,
    "customerName" TEXT NOT NULL,
    "customerPhone" TEXT,
    "deliveryAddress" TEXT,
    "zoneId" TEXT,
    "discountPct" DECIMAL(5,2) NOT NULL,
    "grossPaise" INTEGER NOT NULL,
    "discountPaise" INTEGER NOT NULL,
    "netPaise" INTEGER NOT NULL,
    "taxablePaise" INTEGER NOT NULL,
    "taxPaise" INTEGER NOT NULL,
    "roundOffPaise" INTEGER NOT NULL,
    "deliveryChargePaise" INTEGER NOT NULL,
    "totalPaise" INTEGER NOT NULL,
    "deliveryStaffName" TEXT,
    "collectedMode" "DeliveryCollectionMode",
    "collectedAmountPaise" INTEGER,
    "cashHandedOverAt" TIMESTAMP(3),
    "cancelReason" TEXT,
    "saleId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "packedAt" TIMESTAMP(3),
    "dispatchedAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),

    CONSTRAINT "order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_line" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "qty" DECIMAL(12,3) NOT NULL,
    "mrpPaise" INTEGER NOT NULL,
    "taxRatePct" DECIMAL(5,2) NOT NULL,

    CONSTRAINT "order_line_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_line_batch" (
    "id" TEXT NOT NULL,
    "orderLineId" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "qty" DECIMAL(12,3) NOT NULL,

    CONSTRAINT "order_line_batch_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "order_code_key" ON "order"("code");

-- CreateIndex
CREATE UNIQUE INDEX "order_saleId_key" ON "order"("saleId");

-- AddForeignKey
ALTER TABLE "order" ADD CONSTRAINT "order_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order" ADD CONSTRAINT "order_zoneId_fkey" FOREIGN KEY ("zoneId") REFERENCES "delivery_zone"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order" ADD CONSTRAINT "order_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "sale"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_line" ADD CONSTRAINT "order_line_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_line" ADD CONSTRAINT "order_line_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_line_batch" ADD CONSTRAINT "order_line_batch_orderLineId_fkey" FOREIGN KEY ("orderLineId") REFERENCES "order_line"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_line_batch" ADD CONSTRAINT "order_line_batch_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "batch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

