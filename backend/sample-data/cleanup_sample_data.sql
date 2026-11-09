-- Removes only the sample rows created by generate.mjs. Real data is not touched.
BEGIN;
DELETE FROM "payment" WHERE "saleId" IN (SELECT "id" FROM "sale" WHERE "number" LIKE 'SMP-%');
DELETE FROM "sale_line" WHERE "saleId" IN (SELECT "id" FROM "sale" WHERE "number" LIKE 'SMP-%');
DELETE FROM "sale" WHERE "number" LIKE 'SMP-%';
DELETE FROM "batch" WHERE "code" LIKE 'SMP-%';
DELETE FROM "item" WHERE "code" LIKE 'SMP-%';
DELETE FROM "customer" WHERE "phone" LIKE '90000%';
DELETE FROM "supplier" WHERE "name" LIKE '[Sample] %';
DELETE FROM "category" WHERE "name" LIKE '[Sample] %';
COMMIT;
