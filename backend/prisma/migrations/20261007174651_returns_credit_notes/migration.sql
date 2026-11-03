-- CreateEnum
CREATE TYPE "ReturnDisposition" AS ENUM ('REFUND', 'CREDIT_NOTE');

-- CreateEnum
CREATE TYPE "RefundMode" AS ENUM ('CASH', 'UPI');

-- AlterTable
ALTER TABLE "payment" ADD COLUMN     "creditNoteId" TEXT;


-- CreateTable
CREATE TABLE "credit_note" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "customerId" TEXT,
    "amountPaise" INTEGER NOT NULL,
    "balancePaise" INTEGER NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "credit_note_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "return" (
    "id" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "disposition" "ReturnDisposition" NOT NULL,
    "refundMode" "RefundMode",
    "creditNoteId" TEXT,
    "totalPaise" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "return_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "return_line" (
    "id" TEXT NOT NULL,
    "returnId" TEXT NOT NULL,
    "saleLineBatchId" TEXT NOT NULL,
    "qty" DECIMAL(12,3) NOT NULL,
    "mrpPaise" INTEGER NOT NULL,

    CONSTRAINT "return_line_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "credit_note_number_key" ON "credit_note"("number");

-- CreateIndex
CREATE UNIQUE INDEX "return_creditNoteId_key" ON "return"("creditNoteId");

-- AddForeignKey
ALTER TABLE "payment" ADD CONSTRAINT "payment_creditNoteId_fkey" FOREIGN KEY ("creditNoteId") REFERENCES "credit_note"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_note" ADD CONSTRAINT "credit_note_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "return" ADD CONSTRAINT "return_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "sale"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "return" ADD CONSTRAINT "return_creditNoteId_fkey" FOREIGN KEY ("creditNoteId") REFERENCES "credit_note"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "return_line" ADD CONSTRAINT "return_line_returnId_fkey" FOREIGN KEY ("returnId") REFERENCES "return"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "return_line" ADD CONSTRAINT "return_line_saleLineBatchId_fkey" FOREIGN KEY ("saleLineBatchId") REFERENCES "sale_line_batch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

