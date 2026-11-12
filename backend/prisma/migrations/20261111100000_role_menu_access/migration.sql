-- Sidebar pages each non-owner role may open. The owner edits these in Settings > Menu Access.
-- Owner always has every page, so there are no OWNER rows.
CREATE TABLE "role_menu_access" (
    "role" "Role" NOT NULL,
    "route" TEXT NOT NULL,

    CONSTRAINT "role_menu_access_pkey" PRIMARY KEY ("role", "route")
);

-- Starting defaults, matching the role descriptions on the Users page. The owner can change them.
INSERT INTO "role_menu_access" ("role", "route") VALUES
    ('CASHIER', '/pos'),
    ('CASHIER', '/sales'),
    ('CASHIER', '/returns'),
    ('CASHIER', '/orders'),
    ('CASHIER', '/customers'),
    ('WAREHOUSE', '/orders'),
    ('WAREHOUSE', '/items'),
    ('WAREHOUSE', '/inventory'),
    ('WAREHOUSE', '/batches'),
    ('WAREHOUSE', '/receive-stock'),
    ('WAREHOUSE', '/suppliers'),
    ('DELIVERY', '/orders');
