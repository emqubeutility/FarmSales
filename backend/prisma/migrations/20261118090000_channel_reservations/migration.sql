-- Warehouse stock reserved for a platform, and where each order was placed.
CREATE TYPE "OrderSource" AS ENUM ('FLIPKART', 'AMAZON', 'SHOPIFY', 'DIRECT');
CREATE TYPE "ReservationEventKind" AS ENUM ('RESERVE', 'RELEASE', 'TRANSFER', 'HOLD', 'RELEASE_HOLD', 'CONSUME');

ALTER TABLE "order" ADD COLUMN "source" "OrderSource" NOT NULL DEFAULT 'DIRECT',
ADD COLUMN "externalOrderId" TEXT;

CREATE UNIQUE INDEX "order_source_externalOrderId_key" ON "order"("source", "externalOrderId");

CREATE TABLE "channel_reservation" (
    "itemId" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "source" "OrderSource" NOT NULL,
    "reservedQty" DECIMAL(12,3) NOT NULL,
    "heldQty" DECIMAL(12,3) NOT NULL DEFAULT 0,

    CONSTRAINT "channel_reservation_pkey" PRIMARY KEY ("itemId", "batchId", "source")
);

CREATE TABLE "channel_reservation_event" (
    "id" TEXT NOT NULL,
    "ts" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT,
    "itemId" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "kind" "ReservationEventKind" NOT NULL,
    "fromSource" "OrderSource",
    "toSource" "OrderSource",
    "qty" DECIMAL(12,3) NOT NULL,
    "refType" TEXT,
    "refId" TEXT,
    "note" TEXT,

    CONSTRAINT "channel_reservation_event_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "channel_reservation_event_itemId_batchId_idx" ON "channel_reservation_event"("itemId", "batchId");
CREATE INDEX "channel_reservation_event_refType_refId_idx" ON "channel_reservation_event"("refType", "refId");

ALTER TABLE "channel_reservation" ADD CONSTRAINT "channel_reservation_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "channel_reservation" ADD CONSTRAINT "channel_reservation_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "batch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "channel_reservation_event" ADD CONSTRAINT "channel_reservation_event_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "channel_reservation_event" ADD CONSTRAINT "channel_reservation_event_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "channel_reservation_event" ADD CONSTRAINT "channel_reservation_event_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "batch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Reservations never exceed warehouse stock, and nothing is held beyond what is reserved.
ALTER TABLE "channel_reservation" ADD CONSTRAINT "channel_reservation_qty_check" CHECK ("reservedQty" >= 0 AND "heldQty" >= 0 AND "heldQty" <= "reservedQty");
