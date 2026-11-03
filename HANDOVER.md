# Farm Sales and Inventory App: Handover

Status date: 6 Oct 2026. Stage: design complete, clickable mock built, no production code yet.
Owner: MQ (emQube, Dubai). Client: organic farm-products start-up, Mumbai.

Use this file as the starting brief in VS Code. Put it in the repo root as `HANDOVER.md`, put the short `CLAUDE.md` next to it, and put the mock in `docs/mock/`.

---

## 1. What we are building

A sales and inventory web app (PWA) for a start-up selling organic ghee, flours and millets, always sold as packs.

- Raw material arrives loose or in packs and is repacked. Stock is kept at raw and finished-goods level.
- Items can be bundled into a new product. Bundles are assembled at the time of sale.
- Single warehouse. Sales from a market stall, a warehouse counter, phone, social and online orders. A WooCommerce shop comes later (about 100 SKUs). **Update (2026-10-08): the online shop was instead built custom** (`apps/shop`, v1: guest checkout, COD/UPI-on-delivery only, no payment gateway or accounts yet) feeding the existing Order Desk — WooCommerce sync was dropped in favour of this.
- About 5 users, about 100 bills a day. Internet is always available, so there is no offline mode.
- Light UI, minimal keystrokes, touch-friendly on tablet. Hand-held barcode scanner. Stall device is a phone, tablet or laptop.
- Accounting is in Zoho Books at a consolidated level. Zoho Inventory is NOT used. Stock lives in this app.

## 2. Decisions already made

### Stack
| Area | Decision |
|---|---|
| Frontend | React + TypeScript PWA (Vite) |
| Backend | NestJS (Node, TypeScript) |
| Database | PostgreSQL, via Prisma or Drizzle (pick one in week 1) |
| Jobs | pg-boss or BullMQ (Zoho posting, PDF generation, reports) |
| Hosting | India region (AWS Mumbai or similar) |
| Connectivity | Online only |

### Payments and documents
- Payment modes: cash, UPI (static QR, confirmed by the cashier), credit note, B2B credit. Credit sales are B2B only.
- The app does NOT manage till cash. There is no opening or closing, only a record of cash, UPI and credit amounts. The cash count is done offline and reconciled using the daily summary report.
- Separate document series per sales point:
  - `MK-` retail bill, market stall
  - `WH-` retail bill, warehouse counter
  - `INV-` B2B tax invoice
  - `CN-` credit note
- The bill number is assigned at finalisation or dispatch, not at draft.
- Receipt: thermal or Wi-Fi printer (model not decided), with a UPI QR printed on it. A PDF can be saved and sent manually on WhatsApp. WhatsApp Business API is a later integration.
- Returns: refund, credit note, or exchange against a credit note. Credit notes never expire.

### Pricing, tax and discounts
- Single price list. MRP is tax-inclusive.
- GST is CGST + SGST (intra-state, Maharashtra). Rates are configured per tax class and are effective-dated, so a change never alters past bills.
- Round-off to the nearest rupee, shown on the bill.
- Channel discounts, set as default and max. The cashier may choose any value from 0 up to max and cannot override it.
  - Walk-in: default 0%, max 5%
  - Phone and Online: default 5%, max 10%
  - These are sample values to confirm with the client.
- Delivery: 4 zones to start. Each zone has a fixed fee (tax-inclusive) and a minimum order value for free delivery. Final delivery charge is the zone fee, or zero when the goods total reaches the zone minimum. It is never negative.
- Phone orders: prepaid, COD, or UPI on delivery. COD cash is collected by the company's own delivery staff (a phone-sized "Record delivery" screen exists).

### Costing
- Stock valuation is **weighted-average cost at item level**. Batches do NOT carry their own cost (decision of 6 Oct).
- Pack cost = raw cost consumed plus packing materials, divided by good packs, with wastage recorded.

### Batch management (decided 6 Oct)
1. Costing is not batch-wise (see above).
2. Expiry (best-before) is required, so allocation is FEFO (first expiry, first out).
3. Two batch levels:
   - **Receipt batch**: supplier, supplier lot, receipt date, mfg date, best-before.
   - **Pack batch**: one pack batch per source receipt batch, linked through a genealogy table (`batch_genealogy`) for trace and recall.
4. Bundles have no batch of their own. At sale the components are picked FEFO.
5. Bought-in finished packs are relabelled with the company's own batch label.
6. No legacy labels need support.
7. Packaging materials are not batch-tracked. "Track batches" is a per-item switch.
- Batch code format: item code + `-` + YYMMDD + letter. Examples: raw `RAGI-261006A`, pack `RF500-261006A` and `RF500-261006B`.
- Label barcode is **Code 128** holding `ITEMCODE-BATCHCODE` (hyphen, not `|`, which some scanners misread). The EAN-13 stays on the item master for WooCommerce and online listings. GS1-128 is only needed if supplying retailers.
- Scanning a label picks the exact batch. Tapping a tile or searching picks the earliest-expiry batch with stock, and a line can span two batches.
- Near-expiry alert: 60 days. Shelf life default is per item (e.g. ragi flour 120 days).

### Zoho Books
- Daily consolidated journals per sales point and payment mode, B2B invoices posted individually (with GSTIN), and a COGS entry computed from the app's average cost.
- Zoho is the book of accounts. This app is the source of truth for stock.

## 3. Roles
Owner, Cashier, Warehouse, Delivery. Roles are combinable. About 5 users. Changes in settings are logged.

## 4. Modules and screens (14 in the mock)

| Group | Screen | Notes |
|---|---|---|
| Sell | POS | The detailed one. Scan, tiles, bill, discount, 4 payment modes, receipt, hold bill |
| Sell | Dashboard | Sales, low stock and expiry |
| Sell | Order desk | Phone and online orders, zone and delivery charge, batch allocation |
| Sell | Returns | Refund, credit note, exchange, restock to the same batch |
| Sell | Record delivery (phone) | Mobile screen for COD collection |
| Stock | Items and catalogue | Item code, shelf life, Track batches, tax class |
| Stock | Receive stock | Purchase and goods receipt with supplier lot and best-before per line |
| Stock | Packing | Source batches to pack batches, wastage, cost per pack |
| Stock | Batches | Register, genealogy trace, hold, reprint, export |
| Stock | Barcode labels | Per item and batch, Code 128 |
| Money | B2B and receivables | Customers, ageing, invoices, receipts |
| Money | Reports | Daily summary, valuation, stock by batch and expiry, trace, GST, margin, credit-note liability |
| Admin | Settings | Channels, zones, tax classes, series, users, batch code format |

## 5. Data model (starting point)

Core tables. Everything money-related stores integer paise or `numeric(12,2)`, never float.

- `item` (id, code, name, size, unit, ean13, tax_class_id, mrp, shelf_life_days, track_batches, kind: raw | pack | bundle | material, active)
- `bundle_component` (bundle_item_id, component_item_id, qty)
- `uom_conversion` (item_id, from_unit, to_unit, factor), for kg to packs
- `tax_class` and `tax_rate` (class_id, rate, hsn, effective_from)
- `supplier`, `customer` (type: retail | b2b, GSTIN, credit_limit, terms_days)
- `batch` (id, item_id, code, kind: receipt | pack, supplier_id, supplier_lot, received_on, mfg_date, best_before, status: active | hold)
- `batch_genealogy` (child_batch_id, parent_batch_id, qty_consumed)
- `stock_ledger` (append-only: id, ts, item_id, batch_id, qty_delta, reason: receipt | pack_in | pack_out | sale | return | adjust | count, ref_type, ref_id, unit_cost)
- `stock_balance` (item_id, batch_id, qty), maintained from the ledger, verified by a nightly reconciliation job
- `item_cost` (item_id, avg_cost, qty_on_hand), updated on every receipt and pack run
- `purchase` / `goods_receipt` and `goods_receipt_line` (item, qty, rate, supplier_lot, mfg_date, best_before)
- `packing_run`, `packing_input` (batch_id, qty), `packing_output` (batch_id, qty), `packing_wastage`
- `sale` (id, series, number, sales_point, channel, status, customer_id, discount_pct, totals, round_off, delivery_charge, zone_id)
- `sale_line` (sale_id, item_id, qty, mrp, tax_rate_snapshot) and `sale_line_batch` (sale_line_id, batch_id, qty)
- `payment` (sale_id, mode: cash | upi | credit_note | b2b_credit, amount, reference)
- `credit_note` (number, customer, amount, balance, no expiry) and `return` / `return_line` (with batch_id)
- `stock_count` / `stock_count_line` (with batch_id)
- `document_series` (prefix, next_no), `zone`, `channel_discount`, `user`, `audit_log`
- `zoho_post` (type, date, payload, status, zoho_ref, error)

Rules to enforce:
- The ledger is append-only. Corrections are reversing entries.
- A sale decrements by batch inside one DB transaction, with a row lock on the balance rows (FEFO pick happens server-side, never trusted from the client).
- Totals are calculated server-side. Prices and tax rates are snapshotted on the line.
- Number series are allocated in the same transaction as finalisation (no gaps).

## 6. Calculations (reference implementation exists in the mock POS)

```
gross     = sum(mrp * qty)                      # MRP, GST included
discount  = gross * pct / 100                    # pct <= channel max, enforced server-side
net       = gross - discount
taxable   = net / (1 + rate)                     # per line when rates differ
tax       = net - taxable                        # split half CGST, half SGST
total     = round(net)                           # nearest rupee
round_off = total - net
delivery  = (goods_total >= zone.free_from) ? 0 : zone.fee   # tax-inclusive, never negative
```

When lines carry different GST rates, apportion the discount across lines proportionally before extracting tax. The mock uses a single sample 5% rate.

## 7. Suggested repo layout

```
farm-sales/
  CLAUDE.md
  HANDOVER.md
  docs/mock/            # standalone HTML mock (open index.html)
  apps/
    web/                # React + TS PWA
    api/                # NestJS
  packages/
    shared/             # types, zod schemas, money and tax helpers, FEFO allocator
  prisma/ (or drizzle/) # schema + migrations
  docker-compose.yml    # postgres for local dev
```

Keep money, tax and FEFO logic in `packages/shared` as pure functions with unit tests, used by both the API (authoritative) and the web app (preview only).

## 8. Suggested build order

1. **Foundations**: repo, CI, Postgres, auth and roles, audit log, items, tax classes, document series.
2. **Stock core**: ledger, receipts with batches, balances, FEFO allocator (unit-tested heavily), stock adjustments and counts.
3. **Packing**: unit conversion, source to pack batch genealogy, wastage, average cost, label printing.
4. **POS**: scan and search, bill, discounts, cash and UPI, receipt (print and PDF), hold bills, then bundles.
5. **Orders and delivery**: order desk, zones, delivery charge, COD recording.
6. **Returns and credit notes.**
7. **B2B**: customers, tax invoice, receipts, ageing.
8. **Reports, then Zoho Books posting** (start with a CSV or journal export, then API).
9. **Later**: WhatsApp Business API. (WooCommerce sync was dropped — see the custom online shop note in section 1.)

Every phase ends with something the client can use on a real stall day. Phases 1 to 4 are the minimum viable product.

## 9. Open items and placeholders

These were deliberately left blank in the mock (shown as `[BRACKETED]`):
- Brand name, address, GSTIN, FSSAI number, UPI ID
- HSN codes and GST rates per category (the mock's 5% is a sample, confirm with the CA)
- Delivery-zone pincodes, fees and free-delivery minimums (sample values in mock)
- Final channel discount values
- Printer model and label size
- Whether the label must show the FSSAI licence, batch and best-before in a prescribed layout (check with an FSSAI advisor before printing labels)
- Who approves stock adjustments and counts
- Zoho Books account mapping (chart of accounts) and the posting schedule

## 10. Known limits of the mock
- Only the POS screen is interactive. The others are static layouts with sample data.
- The barcode and QR art are samples, not scannable.
- The mock's data is hard-coded. Numbers were checked for internal consistency, but they are examples.

## 11. How to work with Claude in VS Code

1. Open the repo folder, install the Claude Code extension, and run `claude` in the terminal. It reads `CLAUDE.md` automatically.
2. Start with a planning prompt, one phase at a time. Example for phase 1:
   > Read HANDOVER.md and docs/mock. Propose the monorepo scaffold and the Prisma schema for phase 1 and 2 only (items, tax classes, batches, stock ledger, goods receipt). Do not write code yet. List decisions you need from me.
3. Then implement in small steps with tests. Example for the allocator:
   > Implement `allocateFefo(batches, qty)` in packages/shared with unit tests: single batch, spanning two batches, insufficient stock, held batches skipped, bundle components.
4. Use the mock as the visual and behavioural reference. When the app differs from the mock, the mock is wrong unless this document says otherwise.
5. Keep decisions in this file. When a decision changes, update section 2 first, then code.
