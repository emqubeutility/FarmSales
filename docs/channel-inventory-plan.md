# Channel inventory plan: reservations, orders and status

Status: plan only. No code has changed. Decisions marked **Decided** come from the owner. Items marked **Default** are my choice and can be changed.

## 1. The model in short

- **All stock is physically in the warehouse.** Products are picked there and delivered, whatever the sales channel. So the app never moves physical stock to a channel. It **reserves** warehouse stock for a channel.
- **Reservations are a plan, not a movement.** A reservation says "Amazon may sell 20 × RF500 from batch RF500-0926". Moving 5 units from Amazon to Flipkart changes two reservations. The ledger of physical stock is untouched.
- **Four pools per batch:** on hand (physical), reserved for each channel, held by open orders, and free (on hand minus all reservations).
- **Each channel sells only from its own reservation.** A sale on one platform cannot take another platform's reserved stock. This is what keeps other platforms from being disrupted.
- **Direct sales** (phone, email, walk-in, POS) sell from **free** stock. They never take a platform's reserved stock.
- **Every change is recorded** as an event with who, when, why and the reference. Nothing is overwritten.

Why this fits the current code: `StockLedger` and `StockBalance` already record physical stock per item and batch, and stay as they are. The new reservation layer sits beside them, so the append-only ledger and the FEFO logic in `shared` stay intact.

## 2. Decisions

| # | Question | Answer |
|---|---|---|
| 1 | Who ships marketplace orders? | **Unknown.** The design works either way. The app reserves and holds stock; whether we ship is a per-channel setting that can be added later. |
| 1a | How is stock moved between platforms? | **Decided.** Manual transfer by staff. The app enforces the rules and records the event. |
| 2 | Reservations or direct draw from warehouse? | **Unknown.** Plan uses reservations, which prevent overselling between platforms. |
| 3 | Where do returns go? | **Unknown.** Default in §6. |
| 4 | Shopify | **Decided.** Shopify is our own online shop. Stock is taken from the warehouse and delivered by us. One location. |

## 3. Data model

### 3.1 Unchanged

- `stock_ledger`, `stock_balance`, `item_cost`, `batch`. Physical stock. Not touched.

### 3.2 New: `channel_reservation` (current balances)

One row per item, batch and channel. Updated in the same transaction as each event, like `stock_balance`.

| Column | Meaning |
|---|---|
| `itemId`, `batchId`, `source` | Key. `source` is `FLIPKART`, `AMAZON`, `SHOPIFY`, `DIRECT`. |
| `reservedQty` | Quantity reserved for this channel from this batch. |
| `heldQty` | Part of `reservedQty` taken by open orders that are accepted but not yet packed. |

Rules:
- `available(source, batch) = reservedQty − heldQty`
- `free(batch) = onHand(batch) − Σ reservedQty(all sources, batch)`
- Constraints: `heldQty ≥ 0`, `heldQty ≤ reservedQty`, `reservedQty ≥ 0`, and `Σ reservedQty ≤ onHand` for every batch.

`DIRECT` is included so that direct sales can be given a reservation too, if the owner wants to protect some stock for phone orders. By default direct sales use free stock only.

### 3.3 New: `channel_reservation_event` (append-only)

| Column | Meaning |
|---|---|
| `id`, `ts`, `userId` | When and who. |
| `itemId`, `batchId`, `source` | What and for which channel. |
| `kind` | `RESERVE` (from free or a transfer), `RELEASE` (back to free), `TRANSFER` (between channels, written as a pair), `HOLD` (order accepted), `RELEASE_HOLD` (order cancelled before pack), `CONSUME` (order packed or POS sale). |
| `qtyDelta` | Signed quantity. |
| `refType`, `refId`, `note` | Order, sale, or the staff reason. |

A transfer is one event with `fromSource` and `toSource`, or two linked events sharing one `groupId`. Either way it is one database transaction.

### 3.4 Orders: new fields

On `order`:
- `source` (`FLIPKART`, `AMAZON`, `SHOPIFY`, `DIRECT`). Required for new orders.
- `externalOrderId` (nullable). Unique per `source` when present. This stops the same marketplace order being imported twice.
- `externalStatus`, `externalUpdatedAt` (nullable). The status the marketplace reports.
- `attention` (nullable). Reason the order needs a person: `UNMAPPED_SKU`, `SHORT_RESERVATION`, `SYNC_FAILED`, `CANCELLED_AFTER_PACK`, and so on.

New `order_status_event`:
- `orderId`, `ts`, `status` (our status), `externalStatus`, `source` (`APP` or the marketplace name), `note`.
- Gives the full history: placed, accepted, packed, shipped, delivered, returned, cancelled. "Where it was placed" is `source`. "Where it was delivered" is the delivery address and the delivered event.

Legacy orders: existing `Channel = ONLINE` orders get `source = DIRECT` by default, and the Fulfilments screen labels them "Online (legacy)". **Default:** the owner can correct any legacy order.

### 3.5 New: `sync_job`

One row per push to a marketplace or shop (for example "set Amazon quantity for RF500 to 14"). Fields: `source`, `itemId`, `payload`, `status` (`PENDING`, `OK`, `FAILED`), `attempts`, `lastError`, `createdAt`, `doneAt`. Used once APIs are connected. Shown on the Sync page.

### 3.6 Already done (branch `shradha`, commit a5581d3)

- `marketplace_listing`: which item is listed on which marketplace, and its seller SKU. Lives on the `shradha` branch only.

## 4. Rules that protect the platforms

1. **A channel sells only its own reservation.** Order acceptance and packing use the channel's `available`, never the free pool or another channel's reservation.
2. **Direct sales use free stock only.** If free stock is short, the sale is refused with the message "Only 4 free. Flipkart reserves 12. Move stock from Flipkart first."
3. **Transfers cannot take held stock.** A transfer out of a channel can move at most `available` for that channel. Held quantity stays with its order.
4. **Transfers must be possible.** Moving to a channel needs free stock or stock from another channel. Negative values are refused.
5. **No silent overselling.** If a marketplace order arrives for more than the channel's `available`, the order is accepted into `attention = SHORT_RESERVATION` and not held. It does not steal from another channel. The owner decides: transfer stock, or cancel and tell the customer.
6. **Expiry.** Expired batches are never sold. Reservations on an expired batch are shown on the dashboard as "Expired, reserved for Amazon: 6". They are not released automatically. **Default:** alert only.
7. **Physical counts.** A count changes on hand. If the count falls below the total reserved, the batch shows "Reservations exceed stock" until staff transfer or release. Counts never silently change reservations.
8. **Concurrency.** Each change locks the `stock_balance` and `channel_reservation` rows for the item and batch, then re-checks the rules. Two channels cannot both take the last unit.

## 5. Order and stock flows

**Channel order (marketplace or Shopify, once imported):**
1. Import: match the SKU to an item through `marketplace_listing`. Unknown SKU → `attention = UNMAPPED_SKU`.
2. Accept: place a hold, FEFO within the channel's available batches. Write `HOLD` events. Status `NEW`.
3. Pack: `CONSUME` the holds and decrement on hand with reason `SALE` through the existing ledger. This replaces the current "pack takes FEFO from all stock" step in `orders.service.ts` (`pack`, around line 154). Status `PACKED`.
4. Ship and deliver: status events only, or status pushed from the marketplace. No stock change.
5. Cancel before pack: `RELEASE_HOLD`. Cancel after pack: `attention = CANCELLED_AFTER_PACK`, handled by a return (§6).

**Direct sale (POS, phone, email, walk-in):**
- Same as today, except the FEFO candidates are the **free** quantity per batch, not raw on hand. The change is in `StockService.getFefoCandidates` (`stock/stock.service.ts`, line 149). The FEFO function in `shared` is unchanged. This is the one code path shared by POS and direct orders.
- Each direct order is recorded with `source = DIRECT`.

**Transfer (staff):**
- From the Inventory screen: pick a batch, a quantity, the source (free or a channel) and the destination. The app previews the new reserved and free figures, then saves.
- Writes events, enqueues a `sync_job` for each affected channel (once APIs exist), and records the reason.

**Stock receipt:** adds to on hand and to free, as today.

## 6. Returns and cancellations (Default, to confirm)

- A return received in good condition goes back to the **channel's** reservation, so the platform can sell it again.
- A damaged return is written off through an adjustment, with reason `ADJUST` and the note "return, damaged".
- Direct returns go back to free stock.

## 7. Screens

1. **Inventory** (`frontend/src/pages/InventoryPage.tsx`):
   - Columns: On hand | Free | Flipkart | Amazon | Shopify | Direct.
   - Each channel column shows `available` and, in brackets, `held`.
   - A "Reserve / transfer" action with the preview described in §5.
   - The batch panel shows each batch's reservations.
2. **Channel view** (new page, one per channel): reserved, held, available, sold today, orders by status, near-expiry reservations, last sync.
3. **Fulfilments** (`OrdersPage.tsx`):
   - Source tabs: All, Flipkart, Amazon, Shopify, Direct.
   - Marketplace order ID on each row.
   - A status timeline in the order detail.
   - A "Needs attention" tab listing every `attention` reason.
4. **Sync** (new page): queue of `sync_job` rows with status, last success per channel, and Retry.
5. **Activity** (new page): reservation events and order status events, filterable by channel, user and date.

Touch rules from `CLAUDE.md` apply: 44 px targets, minimal keystrokes, and the server decides every number.

## 8. Code areas

- **`frontend/shared`:** a pure function for free and available quantities, and a pure function that splits a line across a channel's batches. Unit tests cover the rules in §4. Keep money and FEFO logic here.
- **`backend/src/stock`:** `getFefoCandidates` gains a `source` parameter (`null` means free stock). Add reservation methods next to the existing `recordMovement`.
- **`backend/src/reservations` (new module):** reserve, release, transfer, hold, release hold, consume. Owner or Warehouse role for transfers.
- **`backend/src/orders`:** accept/hold step, source and external fields, status events, `attention` handling.
- **`backend/src/sales`:** direct sales use `source = DIRECT` and free stock.
- **`backend/src/marketplaces`:** from branch `shradha`. Import and push come later.
- **Prisma:** one migration adds the three tables and the new order fields. Existing stock needs no backfill, because no reservations exist yet. Existing orders default to `source = DIRECT`.

## 9. Build order (small PRs)

- **P0, no API needed:**
  - Reservation tables, shared rules and tests.
  - Free-stock rule for POS and direct sales.
  - Transfer action and Inventory columns.
  - Order `source` and `externalOrderId` on manual entry, so Flipkart and Amazon orders can be keyed in by hand with the same protections.
  - Status timeline and Needs-attention tab.
  - Activity log.
  - **Value before any API:** staff can run the reservation process from day one.
- **P1, Flipkart API:** import, SKU mapping (from `shradha`), pack and status sync, `sync_job`.
- **P2, Shopify, then Amazon:** each with its own import and quantity push.
- **P3:** returns and cancellations from marketplaces, reconciliation with each platform's reports.

## 10. Tests

- **Shared unit tests:** free and available quantities, transfer limits, hold limits, FEFO within a channel, refusal of direct sales beyond free stock.
- **Backend integration tests (against a test database):** concurrent transfers and holds on the last unit, a hold cancelled after packing, a count that drops below reservations, duplicate `externalOrderId`.
- **Manual check in the browser:** transfer flow on a touch screen, and the preview numbers matching what is saved.

## 11. Open items

1. Who ships Flipkart and Amazon orders, and whether any of it is fulfilled by the platform's warehouse (Flipkart Advantage, Amazon FBA). Affects P1 and P2.
2. Should direct sales be allowed to use stock reserved for a platform when that platform has no open demand? **Default: no.**
3. Returns (§6): confirm the default.
4. Legacy orders (§3.4): confirm that `DIRECT` is right, or name the existing orders that came from Shopify.
5. Invoicing for marketplace orders: confirm whether bills are issued by us at dispatch, as they are for other orders, or by the platform.
