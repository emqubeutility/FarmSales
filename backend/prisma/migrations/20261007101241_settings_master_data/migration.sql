-- CreateEnum
CREATE TYPE "CustomerType" AS ENUM ('RETAIL', 'B2B');


-- CreateTable
CREATE TABLE "delivery_zone" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "pincodes" TEXT,
    "feePaise" INTEGER NOT NULL,
    "freeFromPaise" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "delivery_zone_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "CustomerType" NOT NULL,
    "gstin" TEXT,
    "creditLimitPaise" INTEGER,
    "termsDays" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "delivery_zone_name_key" ON "delivery_zone"("name");

