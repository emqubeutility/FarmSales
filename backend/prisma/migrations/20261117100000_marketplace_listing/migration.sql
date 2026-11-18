-- Marketplace listings: which items are listed on Flipkart or Amazon, and their seller SKU there.
CREATE TYPE "MarketplaceChannel" AS ENUM ('FLIPKART', 'AMAZON');

CREATE TABLE "marketplace_listing" (
    "id" TEXT NOT NULL,
    "marketplace" "MarketplaceChannel" NOT NULL,
    "itemId" TEXT NOT NULL,
    "marketplaceSku" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "marketplace_listing_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "marketplace_listing_marketplace_itemId_key" ON "marketplace_listing"("marketplace", "itemId");
CREATE UNIQUE INDEX "marketplace_listing_marketplace_marketplaceSku_key" ON "marketplace_listing"("marketplace", "marketplaceSku");

ALTER TABLE "marketplace_listing" ADD CONSTRAINT "marketplace_listing_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
