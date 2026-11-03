-- CreateEnum
CREATE TYPE "GoodsReceiptStatus" AS ENUM ('ACTIVE', 'VOID');

-- AlterTable
ALTER TABLE "goods_receipt" ADD COLUMN     "status" "GoodsReceiptStatus" NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN     "voidedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "sale" ADD COLUMN     "voidedAt" TIMESTAMP(3);


