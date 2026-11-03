-- AlterTable
ALTER TABLE "item" ADD COLUMN     "description" TEXT,
ADD COLUMN     "imageUrl" TEXT,
ADD COLUMN     "onlineVisible" BOOLEAN NOT NULL DEFAULT false;
