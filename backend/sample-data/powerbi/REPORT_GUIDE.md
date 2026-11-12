# Farm Sales: Power BI report guide

This builds a 4-page report from the live Neon database. You paste SQL and formulas. You do not write any code.

You need **Power BI Desktop** (free, from the Microsoft Store).

## Before you start

- The database holds **600 sample bills** (numbers start with `SMP-`) and **2 real bills** (WH-000012 and WH-000013). The report counts all of them. To remove the sample bills later, run `cleanup_sample_data.sql`. It deletes only the `SMP-` rows and leaves the real bills alone.
- The SQL below was run against the database and returns the expected rows. The DAX formulas have **not** been run in Power BI Desktop yet. If one shows an error, copy the message and the formula to me.
- All money is stored in paise (1 rupee = 100 paise). The formulas divide by 100 to show rupees.

---

## Step 1: Load four tables

Repeat these steps four times, once for each query below.

1. In Power BI Desktop, click **Home → Get data → More…**
2. Search for **PostgreSQL database** and click **Connect**.
3. **Server:** your Neon host (the address ending in `neon.tech`). **Database:** `neondb`.
4. Open **Advanced options**, paste the SQL for the table into the **SQL statement** box, and click **OK**.
5. Choose **Database** login. Enter the username and password from Neon (or the read-only login from `powerbi_readonly_role.sql`). Click **Connect**.
6. Click **Load**.
7. In the **Fields** pane, right-click the new table, choose **Rename**, and give it the exact name shown.

### Query 1: name it `Bills`

```sql
SELECT
  s.id AS "Bill id",
  s.number AS "Bill number",
  (s."createdAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata') AS "Bill time",
  (s."createdAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata')::date AS "Bill date",
  s.status::text AS "Bill status",
  CASE s."salesPoint"
    WHEN 'MARKET_STALL' THEN 'Market stall'
    WHEN 'WAREHOUSE_COUNTER' THEN 'Warehouse counter'
  END AS "Sales point",
  CASE s.channel
    WHEN 'WALK_IN' THEN 'Walk-in'
    WHEN 'PHONE' THEN 'Phone'
    WHEN 'ONLINE' THEN 'Online'
    WHEN 'EMAIL' THEN 'Email'
    WHEN 'SOCIAL' THEN 'Social'
  END AS "Channel",
  s."customerPhone" AS "Customer phone",
  s."grossPaise" AS "Gross paise",
  s."discountPaise" AS "Discount paise",
  s."roundOffPaise" AS "Round off paise",
  s."deliveryChargePaise" AS "Delivery charge paise",
  s."totalPaise" AS "Total paise"
FROM "sale" s;
```

### Query 2: name it `Lines`

```sql
SELECT
  l.id AS "Line id",
  l."saleId" AS "Bill id",
  i.name AS "Product",
  i.code AS "Product code",
  COALESCE(c.name, 'Uncategorised') AS "Category",
  s.status::text AS "Bill status",
  l.qty AS "Quantity",
  l."mrpPaise" AS "MRP paise",
  l.qty * l."mrpPaise" AS "Line value at MRP paise"
FROM sale_line l
JOIN "sale" s ON s.id = l."saleId"
JOIN item i ON i.id = l."itemId"
LEFT JOIN category c ON c.id = i."categoryId";
```

### Query 3: name it `Payments`

```sql
SELECT
  p.id AS "Payment id",
  p."saleId" AS "Bill id",
  CASE p.mode
    WHEN 'CASH' THEN 'Cash'
    WHEN 'UPI' THEN 'UPI'
    ELSE p.mode::text
  END AS "Payment mode",
  p."amountPaise" AS "Amount paise",
  s.status::text AS "Bill status"
FROM payment p
JOIN "sale" s ON s.id = p."saleId";
```

### Query 4: name it `Stock`

```sql
SELECT
  b.id AS "Batch id",
  b.code AS "Batch code",
  i.name AS "Product",
  COALESCE(c.name, 'Uncategorised') AS "Category",
  COALESCE(sup.name, 'No supplier') AS "Supplier",
  b."bestBefore"::date AS "Best before",
  b.status::text AS "Batch status",
  COALESCE(sb.qty, 0) AS "On hand qty"
FROM batch b
JOIN item i ON i.id = b."itemId"
LEFT JOIN category c ON c.id = i."categoryId"
LEFT JOIN supplier sup ON sup.id = b."supplierId"
LEFT JOIN stock_balance sb ON sb."batchId" = b.id;
```

---

## Step 2: Check the relationships

Click the **Model** icon on the left (the one with three linked boxes). Lines should look like this:

| From | To | Type |
|---|---|---|
| `Bills[Bill id]` | `Lines[Bill id]` | Many to one, single direction |
| `Bills[Bill id]` | `Payments[Bill id]` | Many to one, single direction |

- Delete any other lines Power BI adds on its own, especially ones marked many-to-many.
- `Stock` has no relationship. That is intentional, because stock is a current snapshot, not a sales event.

---

## Step 3: Create a date table

Click **Modeling → New table** and paste this one line:

```dax
Dates = CALENDARAUTO(3)
```

The `3` makes the financial year end in March, which is the Indian financial year.

Then click **Modeling → New column** on the `Dates` table, once for each line below.

```dax
Month = FORMAT(Dates[Date], "MMM yy")
```

```dax
Month key = YEAR(Dates[Date]) * 100 + MONTH(Dates[Date])
```

```dax
Financial year = "FY " & (YEAR(Dates[Date]) - IF(MONTH(Dates[Date]) < 4, 1, 0)) & "-" & RIGHT(YEAR(Dates[Date]) - IF(MONTH(Dates[Date]) < 4, 1, 0) + 1, 2)
```

```dax
Financial quarter = "Q" & (INT(MOD(MONTH(Dates[Date]) - 4, 12) / 3) + 1)
```

```dax
Week starting (Mon) = Dates[Date] - WEEKDAY(Dates[Date], 2) + 1
```

Then:

1. Select the `Dates` table, click **Table tools → Mark as date table**, and pick the `Date` column.
2. Select the `Month` column, click **Column tools → Sort by column**, and choose `Month key`.
3. Create a relationship from `Dates[Date]` (one) to `Bills[Bill date]` (many), single direction.

---

## Step 4: Create the measures

To add a measure, select the table named in the heading, click **Home → New measure**, and paste one line. The name goes before the `=`.

### On `Bills`

```dax
Revenue (₹) = DIVIDE(CALCULATE(SUM(Bills[Total paise]), Bills[Bill status] = "FINALIZED"), 100)
```

```dax
Bills = CALCULATE(COUNTROWS(Bills), Bills[Bill status] = "FINALIZED")
```

```dax
Average bill (₹) = DIVIDE([Revenue (₹)], [Bills])
```

```dax
Discount given (₹) = DIVIDE(CALCULATE(SUM(Bills[Discount paise]), Bills[Bill status] = "FINALIZED"), 100)
```

```dax
Discount % of gross = DIVIDE(CALCULATE(SUM(Bills[Discount paise]), Bills[Bill status] = "FINALIZED"), CALCULATE(SUM(Bills[Gross paise]), Bills[Bill status] = "FINALIZED"))
```

```dax
Voided bills = CALCULATE(COUNTROWS(Bills), Bills[Bill status] = "VOID")
```

```dax
Void rate = DIVIDE([Voided bills], COUNTROWS(Bills))
```

```dax
Customers with phone = CALCULATE(DISTINCTCOUNT(Bills[Customer phone]), Bills[Bill status] = "FINALIZED")
```

```dax
Repeat customers = COUNTROWS(FILTER(VALUES(Bills[Customer phone]), NOT ISBLANK(Bills[Customer phone]) && CALCULATE(COUNTROWS(Bills), Bills[Bill status] = "FINALIZED") > 1))
```

```dax
Repeat customer rate = DIVIDE([Repeat customers], [Customers with phone])
```

### On `Lines`

```dax
Units sold = CALCULATE(SUM(Lines[Quantity]), Lines[Bill status] = "FINALIZED")
```

```dax
Sales at MRP (₹) = DIVIDE(CALCULATE(SUM(Lines[Line value at MRP paise]), Lines[Bill status] = "FINALIZED"), 100)
```

### On `Payments`

```dax
Paid (₹) = DIVIDE(CALCULATE(SUM(Payments[Amount paise]), Payments[Bill status] = "FINALIZED"), 100)
```

```dax
Cash share % = DIVIDE(CALCULATE(SUM(Payments[Amount paise]), Payments[Payment mode] = "Cash", Payments[Bill status] = "FINALIZED"), CALCULATE(SUM(Payments[Amount paise]), Payments[Bill status] = "FINALIZED"))
```

```dax
UPI share % = DIVIDE(CALCULATE(SUM(Payments[Amount paise]), Payments[Payment mode] = "UPI", Payments[Bill status] = "FINALIZED"), CALCULATE(SUM(Payments[Amount paise]), Payments[Bill status] = "FINALIZED"))
```

### On `Stock`

```dax
Units on hand = SUM(Stock[On hand qty])
```

```dax
Batches with stock = CALCULATE(COUNTROWS(Stock), Stock[On hand qty] > 0)
```

```dax
Expired units = CALCULATE(SUM(Stock[On hand qty]), NOT ISBLANK(Stock[Best before]), Stock[Best before] < TODAY())
```

```dax
Expiring in 30 days (units) = CALCULATE(SUM(Stock[On hand qty]), Stock[Best before] >= TODAY(), Stock[Best before] <= TODAY() + 30)
```

**Formatting:** select each `₹` measure and set **Measure tools → Format** to Currency (Indian rupee). Set the `%` measures to Percentage. Set the others to Whole number.

---

## Step 5: Build the four pages

Add a page with the **+** tab at the bottom. Rename each page from the list above.

### Page 1: Overview

1. **Title:** Insert → Text box, type `Farm sales overview`.
2. **Slicers** (Insert → Slicer), one each:
   - `Dates[Financial year]`, shown as a dropdown
   - `Bills[Channel]`
   - `Bills[Sales point]`
3. **Six cards** (Insert → Card), one measure each:
   - `Revenue (₹)`
   - `Bills`
   - `Average bill (₹)`
   - `Units sold`
   - `Discount % of gross`
   - `Void rate`
4. **Line chart** titled "Revenue by month": X-axis `Dates[Month]`, Y-axis `Revenue (₹)`.
5. **Bar chart** titled "Revenue by channel": Y-axis `Bills[Channel]`, X-axis `Revenue (₹)`.
6. **Donut chart** titled "Revenue by sales point": Legend `Bills[Sales point]`, Values `Revenue (₹)`.

### Page 2: Products

1. **Bar chart** titled "Sales at MRP by category": Y-axis `Lines[Category]`, X-axis `Sales at MRP (₹)`.
2. **Table** titled "Top products": columns `Lines[Product]`, `Units sold`, `Sales at MRP (₹)`. Sort by `Sales at MRP (₹)` descending. In the **Filters** pane, add a Top N filter of 10 by `Sales at MRP (₹)`.
3. **Card:** `Units sold`.

Note: `Sales at MRP` is the menu price before bill discounts. It is higher than `Revenue (₹)` by the discount amount.

### Page 3: Payments and customers

1. **Donut chart** titled "How customers paid": Legend `Payments[Payment mode]`, Values `Paid (₹)`.
2. **Cards:** `Cash share %`, `UPI share %`, `Customers with phone`, `Repeat customers`, `Repeat customer rate`.
3. **Table** titled "By channel": `Bills[Channel]`, `Bills`, `Revenue (₹)`, `Average bill (₹)`.

### Page 4: Stock and expiry

Stock is a snapshot of today, so the financial year and channel slicers do not affect this page.

1. **Cards:** `Units on hand`, `Batches with stock`, `Expired units`, `Expiring in 30 days (units)`.
2. **Bar chart** titled "Stock by category": Y-axis `Stock[Category]`, X-axis `Units on hand`.
3. **Table** titled "Batches": `Stock[Batch code]`, `Stock[Product]`, `Stock[Supplier]`, `Stock[Best before]`, `Stock[On hand qty]`. Sort by `Best before` ascending. In the **Filters** pane, set `Stock[On hand qty]` to greater than 0.

---

## Step 6: Save

**File → Save as**, name it `Farm sales report.pbix`, and keep it on your PC.

---

## How the numbers are defined

- **Revenue** is the bill total: after discount, after round-off, and including any delivery charge.
- **VOID bills** are excluded from revenue, bill counts, payments and units sold.
- **Times** are converted from UTC to Indian time (IST) in the SQL, so the dates match the bill dates in the app.
- **Sales at MRP** is before bill discount, so it does not equal revenue.
- **Expired** means the best-before date is before today. Batches with no best-before date are not counted as expired.
- **Repeat customer** means a phone number with more than one finalised bill. Walk-in bills with no phone number are ignored.
