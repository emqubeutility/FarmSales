-- Contact and delivery address of a customer. Filled from the first order that has a phone number,
-- and by hand on the Customers page.
ALTER TABLE "customer" ADD COLUMN "phone" TEXT,
ADD COLUMN "addressLine" TEXT,
ADD COLUMN "landmark" TEXT,
ADD COLUMN "city" TEXT,
ADD COLUMN "state" TEXT,
ADD COLUMN "pincode" TEXT;

CREATE INDEX "customer_phone_idx" ON "customer"("phone");
