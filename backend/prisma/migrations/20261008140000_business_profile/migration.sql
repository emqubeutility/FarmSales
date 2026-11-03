-- CreateTable
CREATE TABLE "business_profile" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "gstin" TEXT,
    "fssaiNumber" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "logoUrl" TEXT,
    "upiId" TEXT,
    "upiQrImageUrl" TEXT,

    CONSTRAINT "business_profile_pkey" PRIMARY KEY ("id")
);
