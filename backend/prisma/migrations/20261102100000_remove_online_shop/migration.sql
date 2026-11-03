-- The online shop is not used: drop its item fields.
ALTER TABLE "item" DROP COLUMN "description", DROP COLUMN "imageUrl", DROP COLUMN "onlineVisible";
