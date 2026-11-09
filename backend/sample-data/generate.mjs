// Generates sample sales data for Power BI (600 bills, about 1,600 bill lines, plus master data).
//
// Run from the backend folder:   node sample-data/generate.mjs
//
// Writes into this folder:
//   sample_data.sql               inserts the sample rows into the database (run once)
//   cleanup_sample_data.sql       removes every sample row again (only touches sample rows)
//   powerbi_readonly_role.sql     optional: a read-only database login for Power BI
//   csv/*.csv                     the same data as files, for Power BI "Get data > Text/CSV"
//
// Every sample row is marked so it can be found and removed later:
//   categories and suppliers are named "[Sample] ...", items and batches use codes "SMP-...",
//   bill numbers start with "SMP-", and customers have phones that start with 90000.
// Money is integer paise, as in the app. GST rates are not invented, so tax is 0 in the sample.

import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const CSV_DIR = join(HERE, 'csv');
mkdirSync(CSV_DIR, { recursive: true });

// ---------- deterministic randomness: the same run always gives the same data ----------
let seed = 20261109;
function rand() {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const between = (a, b) => a + Math.floor(rand() * (b - a + 1));
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
function weighted(pairs) {
  let r = rand();
  for (const [value, weight] of pairs) {
    r -= weight;
    if (r < 0) return value;
  }
  return pairs[pairs.length - 1][0];
}

// ---------- time: bills are stored as UTC, analysed in IST (+05:30, no daylight saving) ----------
const IST_OFFSET_MS = 330 * 60 * 1000;
const DAY_MS = 86400000;
const START_MS = Date.UTC(2026, 1, 1); // 1 Feb 2026
const END_DAY = Math.floor((Date.UTC(2026, 10, 8) - START_MS) / DAY_MS); // 8 Nov 2026
const pad = (n, width = 2) => String(n).padStart(width, '0');
// IST day index + IST hour and minute -> UTC milliseconds.
function istToMs(dayIndex, hour, minute) {
  const day = new Date(START_MS + dayIndex * DAY_MS);
  return Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), hour, minute) - IST_OFFSET_MS;
}
// UTC milliseconds -> the text the database stores for a "timestamp(3)" column.
const utcText = (ms) => new Date(ms).toISOString().replace('T', ' ').slice(0, 19);
const istDateText = (ms) => utcText(ms + IST_OFFSET_MS).slice(0, 10);
const istTimeText = (ms) => utcText(ms + IST_OFFSET_MS).slice(11, 16);

// ---------- master data ----------
const CATEGORY_NAMES = ['Ghee', 'Flours', 'Millets', 'Pulses', 'Spices', 'Sweeteners'];
const categories = CATEGORY_NAMES.map((name) => ({ id: randomUUID(), name: `[Sample] ${name}`, active: true }));
const categoryByShortName = (short) => categories.find((c) => c.name === `[Sample] ${short}`);

const supplierDefs = [
  { name: '[Sample] Nashik Millet Farm', category: 'Millets' },
  { name: '[Sample] Gir Dairy Co-op', category: 'Ghee' },
  { name: '[Sample] Vidarbha Flour Mill', category: 'Flours' },
  { name: '[Sample] Konkan Pulses Traders', category: 'Pulses' },
  { name: '[Sample] Coorg Spice House', category: 'Spices' },
  { name: '[Sample] Kutch Jaggery Works', category: 'Sweeteners' },
];
const suppliers = supplierDefs.map((s) => ({ id: randomUUID(), name: s.name, gstin: null }));
const supplierForCategory = (short) => suppliers[supplierDefs.findIndex((s) => s.category === short)];

// [code, name, size, unit, category, MRP in paise (tax-inclusive), shelf life days, reorder level]
const itemDefs = [
  ['SMP-GH250', 'Cow ghee', '250 g', 'jar', 'Ghee', 49900, 365, 20],
  ['SMP-GH500', 'Cow ghee', '500 g', 'jar', 'Ghee', 89900, 365, 20],
  ['SMP-GH1K', 'Cow ghee', '1 kg', 'jar', 'Ghee', 169900, 365, 10],
  ['SMP-GHBF500', 'Buffalo ghee', '500 g', 'jar', 'Ghee', 74900, 365, 15],
  ['SMP-GHBL500', 'Bilona ghee', '500 ml', 'bottle', 'Ghee', 94900, 365, 15],
  ['SMP-RF500', 'Ragi flour', '500 g', 'pack', 'Flours', 14900, 180, 30],
  ['SMP-RF1K', 'Ragi flour', '1 kg', 'pack', 'Flours', 27900, 180, 20],
  ['SMP-AT1K', 'Whole wheat atta', '1 kg', 'pack', 'Flours', 6900, 180, 40],
  ['SMP-JW500', 'Jowar flour', '500 g', 'pack', 'Flours', 12900, 180, 30],
  ['SMP-BJ500', 'Bajra flour', '500 g', 'pack', 'Flours', 11900, 180, 30],
  ['SMP-FX500', 'Foxtail millet', '500 g', 'pack', 'Millets', 16900, 270, 25],
  ['SMP-LM500', 'Little millet', '500 g', 'pack', 'Millets', 15900, 270, 25],
  ['SMP-KD500', 'Kodo millet', '500 g', 'pack', 'Millets', 15900, 270, 25],
  ['SMP-BR1K', 'Barnyard millet', '1 kg', 'pack', 'Millets', 29900, 270, 15],
  ['SMP-PM500', 'Pearl millet', '500 g', 'pack', 'Millets', 9900, 270, 30],
  ['SMP-TD1K', 'Toor dal', '1 kg', 'pack', 'Pulses', 19900, 365, 20],
  ['SMP-MD1K', 'Moong dal', '1 kg', 'pack', 'Pulses', 17900, 365, 20],
  ['SMP-CP500', 'Chana dal', '500 g', 'pack', 'Pulses', 9900, 365, 30],
  ['SMP-UD1K', 'Urad dal', '1 kg', 'pack', 'Pulses', 18900, 365, 20],
  ['SMP-RM500', 'Rajma', '500 g', 'pack', 'Pulses', 16900, 365, 20],
  ['SMP-TM100', 'Turmeric powder', '100 g', 'pack', 'Spices', 3900, 365, 40],
  ['SMP-CM100', 'Cumin seeds', '100 g', 'pack', 'Spices', 5900, 365, 30],
  ['SMP-GM100', 'Garam masala', '100 g', 'pack', 'Spices', 6900, 365, 30],
  ['SMP-CH100', 'Red chilli powder', '100 g', 'pack', 'Spices', 4900, 365, 40],
  ['SMP-DH100', 'Dhania powder', '100 g', 'pack', 'Spices', 3900, 365, 40],
  ['SMP-JG500', 'Jaggery powder', '500 g', 'pack', 'Sweeteners', 6900, 180, 30],
  ['SMP-HN250', 'Organic honey', '250 g', 'jar', 'Sweeteners', 26900, 365, 15],
  ['SMP-DT250', 'Dates', '250 g', 'pack', 'Sweeteners', 22900, 180, 15],
  ['SMP-BS500', 'Brown sugar', '500 g', 'pack', 'Sweeteners', 5900, 365, 30],
  ['SMP-PJ250', 'Palm jaggery', '250 g', 'pack', 'Sweeteners', 9900, 180, 25],
];
const items = itemDefs.map(([code, name, size, unit, categoryShort, mrpPaise, shelfLifeDays, reorderLevel]) => ({
  id: randomUUID(),
  code,
  name: `[Sample] ${name}`,
  size,
  unit,
  ean13: null,
  taxClassId: null,
  categoryId: categoryByShortName(categoryShort).id,
  categoryName: `[Sample] ${categoryShort}`,
  supplierName: supplierForCategory(categoryShort).name,
  mrpPaise,
  shelfLifeDays,
  reorderLevel,
  trackBatches: true,
  active: true,
}));
const supplierIdByName = Object.fromEntries(suppliers.map((s) => [s.name, s.id]));

// Two batches per item, received at different times, with best-before from the shelf life.
const batches = [];
for (const item of items) {
  for (const n of [1, 2]) {
    const receivedMs = istToMs(n === 1 ? between(0, 60) : between(90, 200), 10, 0);
    batches.push({
      id: randomUUID(),
      itemId: item.id,
      code: `${item.code}-B${n}`,
      supplierId: supplierIdByName[item.supplierName],
      supplierName: item.supplierName,
      supplierLot: `LOT-${item.code}-${n}`,
      receivedOn: utcText(receivedMs),
      mfgDate: utcText(receivedMs - 30 * DAY_MS),
      bestBefore: utcText(receivedMs + item.shelfLifeDays * DAY_MS),
      status: 'ACTIVE',
    });
  }
}

// 120 sample customers, 6 of them B2B. Names and phone numbers are made up.
const FIRST = ['Asha', 'Ravi', 'Meera', 'Kiran', 'Priya', 'Suresh', 'Anita', 'Vijay', 'Sneha', 'Rahul', 'Lata', 'Deepak', 'Pooja', 'Ajay', 'Neha', 'Manoj', 'Rekha', 'Sanjay', 'Divya', 'Rohit'];
const LAST = ['Patil', 'Sharma', 'Desai', 'Joshi', 'Kulkarni', 'Iyer', 'Shah', 'Mehta', 'Rao', 'Pillai', 'Gupta', 'Nair', 'Thakur', 'More', 'Kamat'];
const CITIES = [['Mumbai', '400001'], ['Mumbai', '400050'], ['Mumbai', '400064'], ['Thane', '400601'], ['Navi Mumbai', '400703'], ['Pune', '411001']];
const customers = Array.from({ length: 120 }, (_, i) => {
  const [city, pincode] = pick(CITIES);
  const b2b = i < 6;
  return {
    id: randomUUID(),
    name: b2b ? `[Sample] ${pick(LAST)} Stores` : `${pick(FIRST)} ${pick(LAST)}`,
    type: b2b ? 'B2B' : 'RETAIL',
    gstin: null,
    creditLimitPaise: null,
    termsDays: null,
    phone: `90000${pad(i + 1, 5)}`,
    addressLine: `${between(1, 300)}, Sample Road`,
    landmark: null,
    city,
    state: 'Maharashtra',
    pincode,
    active: true,
    createdMs: istToMs(between(0, END_DAY - 30), 11, 0),
  };
});

// ---------- bills, lines and payments ----------
const CHANNEL_DISCOUNT_PCT = { WALK_IN: 0, PHONE: 2, ONLINE: 5, EMAIL: 3, SOCIAL: 5 };
const CHANNELS = [['WALK_IN', 0.55], ['PHONE', 0.2], ['ONLINE', 0.1], ['EMAIL', 0.05], ['SOCIAL', 0.1]];
const SALES_POINTS = [['WAREHOUSE_COUNTER', 0.6], ['MARKET_STALL', 0.4]];
const LINE_COUNTS = [[1, 0.3], [2, 0.35], [3, 0.2], [4, 0.1], [5, 0.05]];
const SALE_COUNT = 600;

const bills = []; // each bill has a `key` (its creation order) that its lines and payments point to
const billLines = [];
const billPayments = [];
for (let key = 0; key < SALE_COUNT; key++) {
  // Later days get more bills: take the later of two random days.
  const dayIndex = Math.max(between(0, END_DAY - 1), between(0, END_DAY - 1));
  const createdMs = istToMs(dayIndex, between(9, 20), between(0, 59));
  const channel = weighted(CHANNELS);
  const customer = rand() < 0.5 ? pick(customers) : null;
  const bill = {
    key,
    id: randomUUID(),
    number: null, // set after sorting by time
    salesPoint: weighted(SALES_POINTS),
    channel,
    status: rand() < 0.05 ? 'VOID' : 'FINALIZED',
    customerPhone: customer ? customer.phone : null,
    discountPct: CHANNEL_DISCOUNT_PCT[channel],
    createdMs,
  };

  // Distinct items on the bill.
  const chosen = new Set();
  while (chosen.size < weighted(LINE_COUNTS)) chosen.add(pick(items));
  let gross = 0;
  for (const item of chosen) {
    const qty = pick([1, 1, 1, 2, 2, 3]);
    gross += item.mrpPaise * qty;
    billLines.push({ id: randomUUID(), billKey: key, item, qty, mrpPaise: item.mrpPaise });
  }

  // Same arithmetic as the app: discount on the gross, then round the total to the nearest rupee.
  const discountPaise = Math.round((gross * bill.discountPct) / 100);
  const netPaise = gross - discountPaise;
  const totalPaise = Math.round(netPaise / 100) * 100;
  Object.assign(bill, {
    grossPaise: gross,
    discountPaise,
    netPaise,
    taxablePaise: netPaise,
    taxPaise: 0,
    roundOffPaise: totalPaise - netPaise,
    totalPaise,
    finalizedMs: createdMs + 5 * 60000,
    voidedMs: bill.status === 'VOID' ? createdMs + DAY_MS : null,
  });
  bills.push(bill);

  if (bill.status === 'FINALIZED') {
    const mode = weighted([['CASH', 0.55], ['UPI', 0.45]]);
    billPayments.push({
      id: randomUUID(),
      billKey: key,
      mode,
      amountPaise: totalPaise,
      reference: null,
    });
  }
}

// Bill numbers in time order, one sequence per sales point (the app numbers bills this way).
const byTime = [...bills].sort((a, b) => a.createdMs - b.createdMs);
const counter = { WAREHOUSE_COUNTER: 0, MARKET_STALL: 0 };
const prefix = { WAREHOUSE_COUNTER: 'WH', MARKET_STALL: 'MK' };
for (const bill of byTime) {
  counter[bill.salesPoint] += 1;
  bill.number = `SMP-${prefix[bill.salesPoint]}-${pad(counter[bill.salesPoint], 6)}`;
}
// UPI references, numbered in time order.
let upiCount = 0;
for (const bill of byTime) {
  const payment = billPayments.find((p) => p.billKey === bill.key);
  if (payment && payment.mode === 'UPI') {
    upiCount += 1;
    payment.reference = `SMP-UPI-${pad(upiCount, 6)}`;
  }
}

// ---------- SQL text ----------
const sqlValue = (v) => {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
  if (typeof v === 'number') return String(v);
  return `'${String(v).replace(/'/g, "''")}'`;
};
function insertSql(table, columns, rows) {
  const out = [];
  for (let i = 0; i < rows.length; i += 200) {
    const chunk = rows.slice(i, i + 200).map((row) => `(${columns.map((c) => sqlValue(row[c])).join(', ')})`);
    out.push(`INSERT INTO "${table}" (${columns.map((c) => `"${c}"`).join(', ')}) VALUES\n${chunk.join(',\n')};`);
  }
  return out.join('\n\n');
}

// Rows for the database tables, using the exact column names from the schema.
const categoryRows = categories.map((c) => ({ id: c.id, name: c.name, active: c.active }));
const supplierRows = suppliers.map((s) => ({ id: s.id, name: s.name, gstin: s.gstin }));
const itemRows = items.map((i) => ({
  id: i.id, code: i.code, name: i.name, size: i.size, unit: i.unit, ean13: i.ean13, taxClassId: i.taxClassId,
  categoryId: i.categoryId, mrpPaise: i.mrpPaise, shelfLifeDays: i.shelfLifeDays, reorderLevel: i.reorderLevel,
  trackBatches: i.trackBatches, active: i.active,
}));
const batchRows = batches.map((b) => ({
  id: b.id, itemId: b.itemId, code: b.code, supplierId: b.supplierId, supplierLot: b.supplierLot,
  receivedOn: b.receivedOn, mfgDate: b.mfgDate, bestBefore: b.bestBefore, status: b.status,
}));
const customerRows = customers.map((c) => ({
  id: c.id, name: c.name, type: c.type, gstin: c.gstin, creditLimitPaise: c.creditLimitPaise, termsDays: c.termsDays,
  phone: c.phone, addressLine: c.addressLine, landmark: c.landmark, city: c.city, state: c.state, pincode: c.pincode,
  active: c.active, createdAt: utcText(c.createdMs),
}));
const saleIdByKey = new Map(bills.map((b) => [b.key, b.id]));
const saleRows = byTime.map((b) => ({
  id: b.id, number: b.number, salesPoint: b.salesPoint, channel: b.channel, status: b.status,
  customerPhone: b.customerPhone, discountPct: `${b.discountPct}.00`, grossPaise: b.grossPaise,
  discountPaise: b.discountPaise, netPaise: b.netPaise, taxablePaise: b.taxablePaise, taxPaise: b.taxPaise,
  roundOffPaise: b.roundOffPaise, deliveryChargePaise: null, totalPaise: b.totalPaise,
  createdAt: utcText(b.createdMs), finalizedAt: utcText(b.finalizedMs),
  voidedAt: b.voidedMs ? utcText(b.voidedMs) : null,
}));
const saleLineRows = billLines.map((l) => ({
  id: l.id, saleId: saleIdByKey.get(l.billKey), itemId: l.item.id, qty: `${l.qty}.000`, mrpPaise: l.mrpPaise,
  taxRatePct: '0.00', batchId: null,
}));
const paymentRows = billPayments.map((p) => ({
  id: p.id, saleId: saleIdByKey.get(p.billKey), mode: p.mode, amountPaise: p.amountPaise, reference: p.reference,
  creditNoteId: null,
}));

const TABLE_ORDER = [
  ['category', ['id', 'name', 'active'], categoryRows],
  ['supplier', ['id', 'name', 'gstin'], supplierRows],
  ['item', ['id', 'code', 'name', 'size', 'unit', 'ean13', 'taxClassId', 'categoryId', 'mrpPaise', 'shelfLifeDays', 'reorderLevel', 'trackBatches', 'active'], itemRows],
  ['batch', ['id', 'itemId', 'code', 'supplierId', 'supplierLot', 'receivedOn', 'mfgDate', 'bestBefore', 'status'], batchRows],
  ['customer', ['id', 'name', 'type', 'gstin', 'creditLimitPaise', 'termsDays', 'phone', 'addressLine', 'landmark', 'city', 'state', 'pincode', 'active', 'createdAt'], customerRows],
  ['sale', ['id', 'number', 'salesPoint', 'channel', 'status', 'customerPhone', 'discountPct', 'grossPaise', 'discountPaise', 'netPaise', 'taxablePaise', 'taxPaise', 'roundOffPaise', 'deliveryChargePaise', 'totalPaise', 'createdAt', 'finalizedAt', 'voidedAt'], saleRows],
  ['sale_line', ['id', 'saleId', 'itemId', 'qty', 'mrpPaise', 'taxRatePct', 'batchId'], saleLineRows],
  ['payment', ['id', 'saleId', 'mode', 'amountPaise', 'reference', 'creditNoteId'], paymentRows],
];

const sampleSql = [
  '-- Sample data for Power BI. Generated by backend/sample-data/generate.mjs.',
  '-- Run it once in the database SQL editor. To remove it again, run cleanup_sample_data.sql.',
  'BEGIN;',
  ...TABLE_ORDER.map(([table, columns, rows]) => `-- ${table}: ${rows.length} rows\n${insertSql(table, columns, rows)}`),
  'COMMIT;',
  '',
].join('\n\n');

const cleanupSql = `-- Removes only the sample rows created by generate.mjs. Real data is not touched.
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
`;

const readonlyRoleSql = `-- Optional: a read-only login for Power BI, so Power BI can read but never change data.
-- Replace the password with a long random one, and replace neondb with your database name if it differs.
CREATE ROLE powerbi_reader WITH LOGIN PASSWORD 'REPLACE_WITH_A_LONG_RANDOM_PASSWORD';
GRANT CONNECT ON DATABASE neondb TO powerbi_reader;
GRANT USAGE ON SCHEMA public TO powerbi_reader;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO powerbi_reader;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO powerbi_reader;
`;

// ---------- CSV files: plain tables, plus one flat table with a row per bill line ----------
function csvCell(v) {
  if (v === null || v === undefined) return '';
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
function writeCsv(name, columns, rows) {
  const text = [columns.join(','), ...rows.map((r) => columns.map((c) => csvCell(r[c])).join(','))].join('\n') + '\n';
  writeFileSync(join(CSV_DIR, name), text, 'utf8');
}
for (const [table, columns, rows] of TABLE_ORDER) writeCsv(`${table}.csv`, columns, rows);

const SALES_POINT_LABEL = { WAREHOUSE_COUNTER: 'Warehouse counter', MARKET_STALL: 'Market stall' };
const CHANNEL_LABEL = { WALK_IN: 'Walk-in', PHONE: 'Phone', ONLINE: 'Online', EMAIL: 'Email', SOCIAL: 'Social' };
const rupees = (paise) => (paise / 100).toFixed(2);
const flatRows = [];
for (const bill of byTime) {
  const billLinesHere = billLines.filter((l) => l.billKey === bill.key);
  for (const line of billLinesHere) {
    flatRows.push({
      bill_number: bill.number,
      bill_date: istDateText(bill.createdMs),
      bill_time: istTimeText(bill.createdMs),
      month: istDateText(bill.createdMs).slice(0, 7),
      sales_point: SALES_POINT_LABEL[bill.salesPoint],
      channel: CHANNEL_LABEL[bill.channel],
      bill_status: bill.status === 'VOID' ? 'Void' : 'Finalized',
      customer_phone: bill.customerPhone ?? '',
      item_code: line.item.code,
      item_name: line.item.name.replace('[Sample] ', ''),
      category: line.item.categoryName.replace('[Sample] ', ''),
      supplier: line.item.supplierName.replace('[Sample] ', ''),
      qty: line.qty,
      mrp_rupees: rupees(line.mrpPaise),
      // Before the bill discount. Bill totals and payments are in sales.csv, so they are not
      // repeated on every line here (repeating them would count them several times in Power BI).
      line_amount_rupees: rupees(line.mrpPaise * line.qty),
    });
  }
}
writeCsv('sales_report.csv', Object.keys(flatRows[0]), flatRows);

writeFileSync(join(HERE, 'sample_data.sql'), sampleSql, 'utf8');
writeFileSync(join(HERE, 'cleanup_sample_data.sql'), cleanupSql, 'utf8');
writeFileSync(join(HERE, 'powerbi_readonly_role.sql'), readonlyRoleSql, 'utf8');

const count = (rows) => rows.length;
console.log('Sample data written to', HERE);
console.log(`  categories ${count(categoryRows)}, suppliers ${count(supplierRows)}, items ${count(itemRows)}, batches ${count(batchRows)}`);
console.log(`  customers ${count(customerRows)}, bills ${count(saleRows)}, bill lines ${count(saleLineRows)}, payments ${count(paymentRows)}`);
console.log(`  flat report rows (one per bill line): ${count(flatRows)}`);
