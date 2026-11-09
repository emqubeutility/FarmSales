-- Structured delivery address on an order: landmark, city, state and pincode. The address line stays
-- in "deliveryAddress". All optional, because a pickup order has no address.
ALTER TABLE "order" ADD COLUMN "deliveryLandmark" TEXT,
ADD COLUMN "deliveryCity" TEXT,
ADD COLUMN "deliveryState" TEXT,
ADD COLUMN "deliveryPincode" TEXT;
