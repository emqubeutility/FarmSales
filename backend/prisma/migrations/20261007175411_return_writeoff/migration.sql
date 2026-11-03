-- AlterTable
ALTER TABLE "return" ADD COLUMN     "reason" TEXT;

-- AlterTable
ALTER TABLE "return_line" ADD COLUMN     "restock" BOOLEAN NOT NULL DEFAULT true;


