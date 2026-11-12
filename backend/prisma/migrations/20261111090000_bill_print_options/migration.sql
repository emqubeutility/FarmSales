-- Printed-bill options. Both default on, so existing bills keep showing the logo and GSTIN.
ALTER TABLE "business_profile" ADD COLUMN "showLogoOnBills" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "showGstinOnBills" BOOLEAN NOT NULL DEFAULT true;
