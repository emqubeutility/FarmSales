import { useEffect, useMemo, useRef, useState } from "react";
import QRCode from "qrcode";
import { calcBillTotals, isExpired, type Channel } from "@farm-sales/shared";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api, ApiError } from "../lib/api.js";
import { formatPaise } from "../lib/format.js";
import { CameraScanner } from "../components/CameraScanner.js";
import { useAuth } from "../lib/auth-context.js";
import { OrderForm } from "../components/OrderForm.js";
import {
  buildOrderBody,
  emptyOrderForm,
  orderErrors,
  sourceOption,
  type OrderFormErrors,
  type OrderFormKey,
  type OrderFormValues,
  type OrderSource,
} from "../lib/order-form.js";

type PosChannel = Channel;
// Stock on hand per item, from the stock overview (totalQty is a decimal, sent as text).
interface StockRow {
  id: string;
  totalQty: string | number;
}
interface CustomerOption {
  id: string;
  name: string;
}
interface ZoneOption {
  pincodes: string | null;
  id: string;
  name: string;
}

interface TaxRate {
  ratePct: string;
  effectiveFrom: string;
}
interface TaxClass {
  id: string;
  rates: TaxRate[];
}
interface SellableItem {
  trackBatches: boolean;
  id: string;
  code: string;
  name: string;
  size: string | null;
  ean13: string | null;
  mrpPaise: number | null;
  taxClassId: string | null;
}
// One physical pack, from its own label (GET /pack-units?code=).
interface PackLabel {
  code: string;
  status: "IN_STOCK" | "RESERVED" | "SOLD";
  itemId: string;
  batchId: string;
  item: {
    name: string;
    size: string | null;
    mrpPaise: number | null;
    taxClassId: string | null;
  };
  batch: { code: string; bestBefore: string | null; status: string };
}
interface ScanBatch {
  id: string;
  code: string;
  itemId: string;
  status: string;
  bestBefore: string | null;
  item: {
    name: string;
    size: string | null;
    mrpPaise: number | null;
    taxClassId: string | null;
  };
  stockBalances: { qty: string }[];
}

// Shows a pop-up so the cashier cannot miss it, and returns the same text for the red message.
function expiredNotice(message: string): string {
  window.alert(message);
  return message;
}

interface ChannelDiscountRow {
  channel: Channel;
  defaultPct: string;
  maxPct: string;
}
// A bill line is a set of scanned packs of one batch (key = itemId|batchId|packs, one code per pack).
interface BillLine {
  // The item is tracked by batch: its batch must be chosen (batchId) before the bill is held or paid.
  tracked?: boolean;
  key: string;
  itemId: string;
  batchId?: string;
  batchCode?: string;
  unitCodes?: string[];
  name: string;
  mrpPaise: number;
  taxRatePct: number;
  qty: number;
}
interface HeldSale {
  id: string;
  discountPct: string;
  channel: Channel;
  lines: {
    itemId: string;
    qty: string;
    mrpPaise: number;
    taxRatePct: string;
    batchId?: string | null;
    item: { name: string };
  }[];
}
interface FinalizedSale {
  number: string;
  totalPaise: number;
  customerPhone?: string | null;
}

const channelLabels: Record<PosChannel, string> = {
  WALK_IN: "Walk-in",
  PHONE: "Phone",
  ONLINE: "Online",
  EMAIL: "Email",
  SOCIAL: "Social",
};

export function PosPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const orderMode = searchParams.get("mode") === "order";
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [zones, setZones] = useState<ZoneOption[]>([]);
  // Order Desk form (mode=order): the values, which fields have been left, and whether Create order was pressed.
  const [orderValues, setOrderValues] = useState<OrderFormValues>(emptyOrderForm);
  const [orderTouched, setOrderTouched] = useState<Partial<Record<OrderFormKey, boolean>>>({});
  const [orderSubmitted, setOrderSubmitted] = useState(false);
  const [items, setItems] = useState<SellableItem[]>([]);
  const [taxClasses, setTaxClasses] = useState<Record<string, TaxClass>>({});
  const [channelDiscounts, setChannelDiscounts] = useState<
    Record<Channel, ChannelDiscountRow>
  >({} as never);
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState("All");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [showPaymentMethods, setShowPaymentMethods] = useState(false);
  // Counter screen: which counter the bill is for, the stock filter, the grid or list view, and the stock per item.
  // The counter selector was removed from the top bar, so bills always use the warehouse counter.
  const [salesPoint] = useState<"WAREHOUSE_COUNTER" | "MARKET_STALL">("WAREHOUSE_COUNTER");
  const [stockFilter, setStockFilter] = useState<"in" | "all" | "out">("in");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [stockByItem, setStockByItem] = useState<Record<string, number>>({});
  const { user } = useAuth();
  const initials = (user?.name ?? "?")
    .split(" ")
    .filter(Boolean)
    .map((word) => word[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  // Removes a whole line from the bill (scanned packs go with it).
  function removeLine(key: string) {
    setScanMessage(null);
    setLines((prev) => prev.filter((l) => l.key !== key));
  }
  const [scanMessage, setScanMessage] = useState<string | null>(null);
  const scanRef = useRef<HTMLInputElement>(null);
  const [channel, setChannel] = useState<PosChannel>(
    orderMode ? "PHONE" : "WALK_IN",
  );
  const [discountPct, setDiscountPct] = useState(0);
  const [lines, setLines] = useState<BillLine[]>([]);
  const [heldSales, setHeldSales] = useState<HeldSale[]>([]);
  const [showHeld, setShowHeld] = useState(false);
  const [resumingSaleId, setResumingSaleId] = useState<string | null>(null);
  // Cash or UPI payment dialog, open while the cashier takes the phone number and payment.
  const [payDialog, setPayDialog] = useState<"CASH" | "UPI" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<FinalizedSale | null>(null);
  const [busy, setBusy] = useState(false);
  const [showCamera, setShowCamera] = useState(false);

  async function loadAll() {
    const [itemList, taxClassList, discountList, held, stockList] = await Promise.all([
      api.get<SellableItem[]>("/items?active=true"),
      api.get<TaxClass[]>("/tax-classes"),
      api.get<ChannelDiscountRow[]>("/channel-discounts"),
      api.get<HeldSale[]>("/sales/held"),
      // If stock cannot be read, the screen shows no stock badges and does not filter by stock.
      api.get<StockRow[]>("/items/inventory").catch(() => [] as StockRow[]),
    ]);
    setItems(itemList);
    setStockByItem(Object.fromEntries(stockList.map((s) => [s.id, Number(s.totalQty)])));
    setTaxClasses(Object.fromEntries(taxClassList.map((tc) => [tc.id, tc])));
    setChannelDiscounts(
      Object.fromEntries(discountList.map((d) => [d.channel, d])) as Record<
        Channel,
        ChannelDiscountRow
      >,
    );
    setHeldSales(held);
    if (orderMode) {
      const [customerList, zoneList] = await Promise.all([
        api.get<CustomerOption[]>("/customers"),
        api.get<ZoneOption[]>("/zones"),
      ]);
      setCustomers(customerList);
      setZones(zoneList);
    }
  }

  useEffect(() => {
    if (orderMode) setChannel("PHONE");
    void loadAll();
  }, [orderMode]);

  // A barcode scanner types the code very fast and ends it with Enter. Keys typed fast while no text
  // box has focus are collected here, and the code goes to the bill when Enter arrives. No click is
  // needed first. Keys typed into a text box (search or manual entry) are left to that box.
  const scanHandlerRef = useRef<(code: string) => void>(() => {});
  const scanBufferRef = useRef("");
  const lastKeyAtRef = useRef(0);
  useEffect(() => {
    scanHandlerRef.current = (code: string) => {
      handleScan(code);
    };
  });
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (orderMode) return;
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      )
        return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const now = Date.now();
      if (now - lastKeyAtRef.current > 200) scanBufferRef.current = ""; // a human pause, not a scanner burst
      lastKeyAtRef.current = now;
      if (e.key === "Enter") {
        const code = scanBufferRef.current;
        scanBufferRef.current = "";
        if (code.length >= 3) {
          // A focused button would otherwise be clicked by this Enter.
          e.preventDefault();
          e.stopPropagation();
          scanHandlerRef.current(code);
        }
        return;
      }
      if (e.key.length === 1) scanBufferRef.current += e.key;
    }
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [orderMode]);

  // Used by the Add button and the Enter key in the item box. A code is scanned (pack or batch), an
  // item code adds that item, and a name adds the item when exactly one product matches it.
  function submitManualCode() {
    const value = search.trim();
    if (!value) return;
    const upper = value.toUpperCase();
    const exact = items.find(
      (i) => i.code.toUpperCase() === upper || (i.ean13 !== null && i.ean13 === value),
    );
    if (exact) {
      addItemToLines(exact);
      setSearch("");
      setPage(1);
      setScanMessage(`Added ${exact.name}`);
      return;
    }
    if (value.includes("-")) {
      setSearch("");
      setPage(1);
      handleScan(value);
      return;
    }
    if (filteredItems.length === 1) {
      addItemToLines(filteredItems[0]);
      setSearch("");
      setPage(1);
      setScanMessage(`Added ${filteredItems[0].name}`);
      return;
    }
    setScanMessage(null);
    setError(
      filteredItems.length === 0
        ? `No item or pack matches "${value}".`
        : `${filteredItems.length} items match. Pick one from the list, or type the full code.`,
    );
  }

  useEffect(() => {
    setDiscountPct(Number(channelDiscounts[channel]?.defaultPct ?? 0));
  }, [channel, channelDiscounts]);

  const maxDiscountPct = Number(channelDiscounts[channel]?.maxPct ?? 0);

  function taxRateByClass(taxClassId: string | null): number {
    const taxClass = taxClassId ? taxClasses[taxClassId] : undefined;
    return taxClass?.rates?.[0] ? Number(taxClass.rates[0].ratePct) : 0;
  }

  // Adds one scanned pack. Its code is recorded on the line, so the same pack can't be added twice.
  function addPackToBill(pack: PackLabel) {
    const key = `${pack.itemId}|${pack.batchId}|packs`;
    setLines((prev) => {
      const existing = prev.find((l) => l.key === key);
      if (existing) {
        const codes = [...(existing.unitCodes ?? []), pack.code];
        return prev.map((l) =>
          l.key === key ? { ...l, unitCodes: codes, qty: codes.length } : l,
        );
      }
      return [
        ...prev,
        {
          key,
          itemId: pack.itemId,
          batchId: pack.batchId,
          batchCode: pack.batch.code,
          unitCodes: [pack.code],
          name: pack.item.size
            ? `${pack.item.name} ${pack.item.size}`
            : pack.item.name,
          mrpPaise: pack.item.mrpPaise ?? 0,
          taxRatePct: taxRateByClass(pack.item.taxClassId),
          qty: 1,
        },
      ];
    });
  }

  // A pack label carries its batch barcode, so scanning it adds one pack of that batch. Which pack
  // is taken is decided when the bill is saved (oldest first), as with a manual add.
  function addBatchToBill(batch: ScanBatch) {
    if (batch.status !== "ACTIVE") {
      setError(`Batch ${batch.code} is on hold and cannot be sold`);
      return;
    }
    if (isExpired(batch.bestBefore)) {
      const day = batch.bestBefore
        ? new Date(batch.bestBefore).toLocaleDateString("en-IN")
        : "";
      setError(
        expiredNotice(
          `EXPIRED: batch ${batch.code} expired on ${day}. It cannot be sold and is not added to the bill.`,
        ),
      );
      return;
    }
    const key = `${batch.itemId}|${batch.id}|batch`;
    const inStock = batch.stockBalances.reduce((sum, b) => sum + Number(b.qty), 0);
    const onBill = lines.find((l) => l.key === key)?.qty ?? 0;
    if (onBill + 1 > inStock) {
      setError(
        `Only ${inStock} pack${inStock === 1 ? "" : "s"} of ${batch.code} in stock`,
      );
      return;
    }
    setLines((prev) => {
      const existing = prev.find((l) => l.key === key);
      if (existing) {
        return prev.map((l) => (l.key === key ? { ...l, qty: l.qty + 1 } : l));
      }
      return [
        ...prev,
        {
          key,
          itemId: batch.itemId,
          batchId: batch.id,
          batchCode: batch.code,
          name: batch.item.size
            ? `${batch.item.name} ${batch.item.size}`
            : batch.item.name,
          mrpPaise: batch.item.mrpPaise ?? 0,
          taxRatePct: taxRateByClass(batch.item.taxClassId),
          qty: 1,
        },
      ];
    });
    setScanMessage(`Added ${batch.item.name} · batch ${batch.code}`);
  }

  // Takes the last scanned pack off its line. Packs are removed by scanning or by this button.
  function removeLastPack(key: string) {
    setScanMessage(null);
    setLines((prev) =>
      prev.flatMap((l) => {
        if (l.key !== key || !l.unitCodes) return [l];
        const codes = l.unitCodes.slice(0, -1);
        return codes.length === 0
          ? []
          : [{ ...l, unitCodes: codes, qty: codes.length }];
      }),
    );
  }

  // Scanner or typed input. A pack label (for example BANSI500-261026A-0001) adds that one pack.
  // Packs are sold one label at a time, so an item or batch code is not used to sell packs.
  async function handleScan(raw: string) {
    const code = raw.trim();
    if (!code || busy) return; // nothing to add, or a sale is being saved
    setError(null);
    setScanMessage(null);
    if (resumingSaleId) {
      setError("Cancel the resumed bill before scanning new items");
      return;
    }

    const upper = code.toUpperCase();

    if (/-\d{4}$/.test(code)) {
      let pack: PackLabel;
      try {
        pack = await api.get<PackLabel>(
          `/pack-units?code=${encodeURIComponent(code)}`,
        );
      } catch (err) {
        setError(
          err instanceof ApiError && err.status === 404
            ? `"${code}" is not a pack label`
            : "Could not look up that pack label",
        );
        return;
      }
      if (lines.some((l) => l.unitCodes?.includes(pack.code))) {
        setError(
          `Pack ${pack.code} is already on this bill. Each pack is added once.`,
        );
        return;
      }
      if (pack.status === "SOLD") {
        setError(`Pack ${pack.code} has already been sold`);
        return;
      }
      if (pack.status === "RESERVED") {
        setError(`Pack ${pack.code} is on a held bill`);
        return;
      }
      if (pack.batch.status !== "ACTIVE") {
        setError(`Batch ${pack.batch.code} is on hold and cannot be sold`);
        return;
      }
      if (isExpired(pack.batch.bestBefore)) {
        const day = pack.batch.bestBefore
          ? new Date(pack.batch.bestBefore).toLocaleDateString("en-IN")
          : "";
        setError(
          expiredNotice(
            `EXPIRED: pack ${pack.code} (batch ${pack.batch.code}) expired on ${day}. It cannot be sold and is not added to the bill.`,
          ),
        );
        return;
      }
      addPackToBill(pack);
      setScanMessage(`Added ${pack.item.name} · pack ${pack.code}`);
      return;
    }

    const item = items.find(
      (i) =>
        i.code.toUpperCase() === upper ||
        (i.ean13 !== null && i.ean13 === code),
    );
    if (item) {
      setError(
        `${item.name} is sold by its pack label. Scan the label on the pack (its code ends in -0001, -0002 and so on).`,
      );
      return;
    }

    try {
      const matches = await api.get<ScanBatch[]>(
        `/batches?search=${encodeURIComponent(code)}`,
      );
      const batch = matches.find((b) => b.code.toUpperCase() === upper);
      if (batch) {
        addBatchToBill(batch);
        return;
      }
      setError(`"${code}" is not a product, batch or pack code`);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Could not look up that code",
      );
    }
  }

  function setQty(key: string, qty: number) {
    setScanMessage(null); // the "Added …" note no longer matches the bill
    setLines((prev) =>
      qty <= 0
        ? prev.filter((l) => l.key !== key)
        : prev.map((l) => (l.key === key ? { ...l, qty } : l)),
    );
  }

  const totals = useMemo(() => {
    if (lines.length === 0) return null;
    try {
      return calcBillTotals(
        lines.map((l) => ({
          mrpPaise: l.mrpPaise,
          qty: l.qty,
          taxRatePct: l.taxRatePct,
        })),
        discountPct,
        maxDiscountPct || 100,
      );
    } catch {
      return null;
    }
  }, [lines, discountPct, maxDiscountPct]);

  const categoryKeywords: Record<string, string[]> = {
    Rice: ["rice"],
    "Atta & Flours": ["atta", "flour", "besan"],
    Millets: ["millet"],
    "Ghee & Oils": ["ghee", "oil"],
    Pulses: ["chana", "dal", "pulse", "lentil"],
  };
  const stockKnown = Object.keys(stockByItem).length > 0;
  function stockOf(id: string): number | null {
    return stockKnown ? (stockByItem[id] ?? 0) : null;
  }
  const filteredItems = items.filter((item) => {
    const searchable = `${item.name} ${item.code} ${item.size ?? ""}`.toLowerCase();
    const matchesSearch = searchable.includes(search.toLowerCase().trim());
    if (!matchesSearch) return false;
    if (!orderMode && stockKnown) {
      const stock = stockByItem[item.id] ?? 0;
      if (stockFilter === "in" && stock <= 0) return false;
      if (stockFilter === "out" && stock > 0) return false;
    }
    if (activeCategory === "All") return true;
    if (activeCategory === "Others") {
      return !Object.values(categoryKeywords).flat().some((word) => searchable.includes(word));
    }
    return (categoryKeywords[activeCategory] ?? []).some((word) => searchable.includes(word));
  });
  const pageCount = Math.max(1, Math.ceil(filteredItems.length / pageSize));
  const paginatedItems = filteredItems.slice((page - 1) * pageSize, page * pageSize);
  const pageStart = filteredItems.length === 0 ? 0 : (page - 1) * pageSize + 1;
  const pageEnd = Math.min(page * pageSize, filteredItems.length);

  // Adds one unit of an item without a pack label. The server picks its batch (FEFO) when the bill
  // is saved. Used for bills and orders alike. Scanned packs keep their own lines.
  function addItemToLines(item: SellableItem) {
    setError(null);
    setLines((prev) => {
      const existing = prev.find(
        (line) => line.itemId === item.id && !line.unitCodes && !line.batchId,
      );
      if (existing)
        return prev.map((line) =>
          line.key === existing.key ? { ...line, qty: line.qty + 1 } : line,
        );
      return [
        ...prev,
        {
          key: `${item.id}-${Date.now()}`,
          itemId: item.id,
          tracked: item.trackBatches,
          name: item.size ? `${item.name} ${item.size}` : item.name,
          mrpPaise: item.mrpPaise ?? 0,
          taxRatePct: taxRateByClass(item.taxClassId),
          qty: 1,
        },
      ];
    });
  }

  // The Order Desk body and its problems, recomputed as the form changes. Shown errors are the ones for
  // fields already left, or all of them once Create order has been pressed.
  const orderBody = buildOrderBody(orderValues, customers, lines, discountPct, "WAREHOUSE_COUNTER");
  const allOrderErrors: OrderFormErrors = orderMode ? orderErrors(orderValues, orderBody) : {};
  const visibleOrderErrors: OrderFormErrors = {};
  for (const key of Object.keys(allOrderErrors) as OrderFormKey[]) {
    if (orderSubmitted || orderTouched[key]) visibleOrderErrors[key] = allOrderErrors[key];
  }

  function setOrderField<K extends keyof OrderFormValues>(key: K, value: OrderFormValues[K]) {
    setError(null); // an old "fix the fields" message no longer matches the form
    setOrderValues((v) => ({ ...v, [key]: value }));
  }

  // Picking a source sets the sales channel too, so the channel discount follows it.
  function chooseOrderSource(source: OrderSource) {
    setError(null);
    setOrderValues((v) => ({ ...v, source, customerId: "" }));
    setChannel(sourceOption(source).channel);
  }

  function touchOrderField(key: OrderFormKey) {
    setOrderTouched((t) => ({ ...t, [key]: true }));
  }

  async function createOrder() {
    setOrderSubmitted(true);
    const problems = orderErrors(orderValues, orderBody);
    if (Object.keys(problems).length > 0) {
      setError(problems.lines ?? "Fix the highlighted fields before creating the order");
      return;
    }
    setError(null);
    setBusy(true);
    try {
      await api.post("/orders", orderBody);
      resetCart();
      setOrderValues(emptyOrderForm);
      setOrderTouched({});
      setOrderSubmitted(false);
      navigate("/orders");
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Could not create order",
      );
    } finally {
      setBusy(false);
    }
  }

  function resetCart() {
    setLines([]);
    setResumingSaleId(null);
    setDiscountPct(Number(channelDiscounts[channel]?.defaultPct ?? 0));
    setScanMessage(null);
  }

  // Lines sent to the server. Scanned packs carry their batch and codes.
  function billLines(list: BillLine[] = lines) {
    return list.map((l) => ({
      itemId: l.itemId,
      qty: l.qty,
      batchId: l.batchId,
      unitCodes: l.unitCodes,
    }));
  }

  // Pay: the payment method, then the payment. Hold: saves the bill. No batch step; the server
  // picks the batch oldest first unless a batch was scanned onto the line.
  function startSave(next: "hold" | "CASH" | "UPI") {
    setError(null);
    if (next === "hold") void handleHold();
    else setPayDialog(next);
  }

  async function handleHold(list: BillLine[] = lines) {
    setError(null);
    setBusy(true);
    try {
      await api.post("/sales/hold", {
        salesPoint,
        channel,
        discountPct,
        lines: billLines(list),
      });
      resetCart();
      await loadAll();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not hold bill");
    } finally {
      setBusy(false);
    }
  }

  function resumeHeld(sale: HeldSale) {
    setResumingSaleId(sale.id);
    setChannel(sale.channel as PosChannel);
    setDiscountPct(Number(sale.discountPct));
    setLines(
      sale.lines.map((l) => ({
        key: l.itemId,
        itemId: l.itemId,
        batchId: l.batchId ?? undefined,
        tracked: items.find((i) => i.id === l.itemId)?.trackBatches ?? false,
        name: l.item.name,
        mrpPaise: l.mrpPaise,
        taxRatePct: Number(l.taxRatePct),
        qty: Number(l.qty),
      })),
    );
    setShowHeld(false);
  }

  // Completes the sale. Returns true when it is saved, so the payment dialog can close.
  async function pay(mode: "CASH" | "UPI", customerPhone: string): Promise<boolean> {
    if (!totals) return false;
    setError(null);
    setBusy(true);
    try {
      const payments = [{ mode, amountPaise: totals.totalPaise }];
      const sale = resumingSaleId
        ? await api.post<FinalizedSale>(
            `/sales/${resumingSaleId}/resume-finalize`,
            { payments, customerPhone },
          )
        : await api.post<FinalizedSale>("/sales/finalize", {
            salesPoint,
            channel,
            discountPct,
            lines: billLines(),
            customerPhone,
            payments,
          });
      setReceipt(sale);
      resetCart();
      await loadAll();
      return true;
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Payment failed");
      return false;
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="top">
        <h1>{orderMode ? "New order" : "Counter Sale"}</h1>
        {orderMode && <span className="pill g">Order Desk</span>}
        <div style={{ flex: 1 }} />
        {orderMode ? (
          <button className="btn" onClick={() => navigate("/orders")}>
            Cancel
          </button>
        ) : (
          <>
            
            <button
              className="btn"
              style={{ minHeight: 40, display: "inline-flex", alignItems: "center", gap: 8 }}
              onClick={() => setShowHeld((v) => !v)}
            >
              Held bills
              <span className={`pill ${heldSales.length ? "g" : "n"}`}>{heldSales.length}</span>
            </button>
            <span
              title={user?.name}
              aria-label={`Signed in as ${user?.name ?? "user"}`}
              style={{ width: 40, height: 40, borderRadius: "50%", background: "#145B2B", color: "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 14 }}
            >
              {initials}
            </span>
          </>
        )}
      </div>
      <div className="body pos-layout">
        <div
          style={{
            flex: 1,
            minWidth: 0,
            display: "flex",
            flexDirection: "column",
            gap: 12,
            // Counter screen: the item area fits the window, so the pagination stays at the bottom.
            height: orderMode ? undefined : "calc(100vh - 110px)",
            minHeight: orderMode ? undefined : 460,
          }}
        >
          {!orderMode && (
            <div>
              <div style={{ display: "flex", gap: 10 }}>
                <input
                  ref={scanRef}
                  className="in"
                  style={{ height: 56, fontSize: 17, flex: 1, minWidth: 0, borderRadius: 14 }}
                  placeholder="Scan pack label, or type item code or name…"
                  aria-label="Scan or search items"
                  value={search}
                  disabled={!!resumingSaleId || busy}
                  onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                  onKeyDown={(e) => {
                    if (e.key !== "Enter") return;
                    e.preventDefault();
                    submitManualCode();
                  }}
                  autoComplete="off"
                />
                <button
                  type="button"
                  className="btn p"
                  style={{ minHeight: 56, padding: "0 26px", fontSize: 16, borderRadius: 14 }}
                  disabled={!search.trim() || !!resumingSaleId || busy}
                  onClick={submitManualCode}
                >
                  Add
                </button>
                <button
                  type="button"
                  className="btn"
                  style={{ minHeight: 56, padding: "0 18px", borderRadius: 14 }}
                  disabled={!!resumingSaleId || busy}
                  onClick={() => setShowCamera(true)}
                >
                  Camera
                </button>
              </div>
              {scanMessage && (
                <div
                  style={{
                    marginTop: 6,
                    color: "#14502F",
                    fontWeight: 600,
                    fontSize: 14,
                  }}
                >
                  {scanMessage}
                </div>
              )}
            </div>
          )}
          {orderMode && (
            <OrderForm
              values={orderValues}
              customers={customers}
              zones={zones}
              errors={visibleOrderErrors}
              onChange={setOrderField}
              onSourceChange={chooseOrderSource}
              onBlur={touchOrderField}
            />
          )}
          {orderMode && (
            <input
              className="in"
              style={{ height: 44, fontSize: 15 }}
              placeholder="Search item by name or code"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            />
          )}
          {error && <div className="error-banner">{error}</div>}
          {!orderMode && (
            <div className="pos-category-row" role="group" aria-label="Product categories">
              {["All", "Rice", "Atta & Flours", "Millets", "Ghee & Oils", "Pulses", "Others"].map((category) => (
                <button
                  key={category}
                  type="button"
                  className={`pos-category-chip${activeCategory === category ? " active" : ""}`}
                  onClick={() => { setActiveCategory(category); setPage(1); }}
                >
                  {category}
                </button>
              ))}
            </div>
          )}
          {!orderMode && (
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <select
                className="in"
                aria-label="Stock filter"
                style={{ width: 200, height: 46, borderRadius: 12, fontWeight: 600 }}
                value={stockFilter}
                onChange={(e) => { setStockFilter(e.target.value as "in" | "all" | "out"); setPage(1); }}
              >
                <option value="all">All items</option>
                <option value="in">In stock only</option>
                <option value="out">Out of stock</option>
              </select>
              <div style={{ flex: 1 }} />
              <div role="group" aria-label="View" style={{ display: "inline-flex", border: "1px solid #D2D8D2", borderRadius: 12, overflow: "hidden", background: "#fff" }}>
                {(["grid", "list"] as const).map((v) => (
                  <button
                    key={v}
                    type="button"
                    aria-pressed={viewMode === v}
                    onClick={() => setViewMode(v)}
                    style={{ minWidth: 60, minHeight: 46, border: 0, background: viewMode === v ? "#145B2B" : "#fff", color: viewMode === v ? "#fff" : "#3E4F45", fontWeight: 700, cursor: "pointer" }}
                  >
                    {v === "grid" ? "Grid" : "List"}
                  </button>
                ))}
              </div>
            </div>
          )}
          {!orderMode && showHeld && (
            <div className="card" style={{ padding: 12 }}>
              <div style={{ fontWeight: 700, marginBottom: 8 }}>Held bills</div>
              {heldSales.length === 0 && <div className="muted">None</div>}
              {heldSales.map((s) => (
                <div
                  key={s.id}
                  className="row"
                  style={{ cursor: "pointer" }}
                  onClick={() => resumeHeld(s)}
                >
                  <span>
                    {s.lines.length} line(s) ·{" "}
                    {channelLabels[s.channel as PosChannel] ?? s.channel}
                  </span>
                  <span className="pill b">Resume</span>
                </div>
              ))}
            </div>
          )}
          <div
            style={{
              flex: 1,
              minHeight: 0,
              overflow: "auto",
              display: "grid",
              // Grid: as many compact cards per row as fit. List: one thin row per item.
              gridTemplateColumns: viewMode === "list" ? "1fr" : "repeat(auto-fill, minmax(250px, 1fr))",
              gap: viewMode === "list" ? 6 : 10,
              alignContent: "start",
              paddingRight: 10,
            }}
          >
            {paginatedItems.length === 0 && (
              <div className="muted" style={{ gridColumn: "1 / -1", padding: 32, textAlign: "center" }}>
                {stockFilter === "in" && stockKnown && search.trim() === "" && activeCategory === "All" ? (
                  <>
                    Nothing in stock right now.{" "}
                    <button type="button" className="btn" style={{ minHeight: 36, marginLeft: 6 }} onClick={() => { setStockFilter("all"); setPage(1); }}>
                      Show all items
                    </button>
                  </>
                ) : (
                  "No products match your search."
                )}
              </div>
            )}
            {paginatedItems.map((item) => (
              <button
                key={item.id}
                type="button"
                className="card"
                onClick={() => addItemToLines(item)}
                style={{
                  textAlign: "left",
                  padding: viewMode === "list" ? "8px 14px" : "12px 14px",
                  minHeight: viewMode === "list" ? 56 : undefined,
                  display: "flex",
                  flexDirection: viewMode === "list" ? "row" : "column",
                  alignItems: viewMode === "list" ? "center" : undefined,
                  gap: viewMode === "list" ? 14 : 8,
                  boxShadow: "0 2px 8px rgba(20, 48, 31, .035)",
                }}
              >
                {(() => {
                  const stock = stockOf(item.id);
                  const list = viewMode === "list";
                  return (
                    <>
                      <span style={{ display: "flex", flexDirection: "column", gap: list ? 2 : 4, flex: 1, minWidth: 0 }}>
                        <b style={{ fontSize: 16, lineHeight: 1.25, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: list ? "nowrap" : "normal" }}>
                          {item.name}{item.size ? ` ${item.size}` : ""}
                        </b>
                        <span className="muted" style={{ fontSize: 12 }}>{item.code}</span>
                        {!list && (
                          <span style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 2 }}>
                            <span className={`pill ${item.trackBatches ? "b" : "n"}`} style={{ fontSize: 11, padding: "2px 8px" }}>{item.trackBatches ? "Batch" : "No batch"}</span>
                            {stock !== null && (
                              <span className={`pill ${stock > 0 ? "g" : "rd"}`} style={{ fontSize: 11, padding: "2px 8px" }}>{stock > 0 ? "In stock" : "Out of stock"}</span>
                            )}
                          </span>
                        )}
                      </span>
                      {list && (
                        <span style={{ display: "flex", gap: 6, flex: "none" }}>
                          <span className={`pill ${item.trackBatches ? "b" : "n"}`} style={{ fontSize: 11, padding: "2px 8px" }}>{item.trackBatches ? "Batch" : "No batch"}</span>
                          {stock !== null && (
                            <span className={`pill ${stock > 0 ? "g" : "rd"}`} style={{ fontSize: 11, padding: "2px 8px" }}>{stock > 0 ? "In stock" : "Out of stock"}</span>
                          )}
                        </span>
                      )}
                      <span style={{ display: "flex", alignItems: "center", gap: 12, flex: "none", justifyContent: "space-between" }}>
                        <span style={{ fontWeight: 800, fontSize: 17 }}>{formatPaise(item.mrpPaise)}</span>
                        <span className="pos-add-label" style={{ minHeight: 34, padding: "0 12px", fontSize: 14 }}>+ Add</span>
                      </span>
                    </>
                  );
                })()}
              </button>
            ))}
          </div>
          {!orderMode && (
            <div className="pos-pagination" style={{ flex: "none", background: "#F3F5F1", paddingTop: 10 }}>
              <span className="pos-pagination-summary">Showing {pageStart}–{pageEnd} of {filteredItems.length} items</span>
              <div className="pos-page-controls">
                <button type="button" className="pos-page-button" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))} aria-label="Previous page">‹</button>
                {Array.from({ length: pageCount }, (_, index) => index + 1).filter((pageNumber) => pageNumber === 1 || pageNumber === pageCount || Math.abs(pageNumber - page) <= 1).map((pageNumber, index, list) => (
                  <span key={pageNumber} style={{ display: "contents" }}>
                    {index > 0 && list[index - 1] !== pageNumber - 1 && <span className="pos-page-ellipsis">…</span>}
                    <button type="button" className={`pos-page-button${page === pageNumber ? " active" : ""}`} onClick={() => setPage(pageNumber)}>{pageNumber}</button>
                  </span>
                ))}
                <button type="button" className="pos-page-button" disabled={page >= pageCount} onClick={() => setPage((p) => Math.min(pageCount, p + 1))} aria-label="Next page">›</button>
              </div>
              <label className="pos-page-size-label">Items per page
                <select className="in pos-page-size" value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}>
                  {[25, 50, 100].map((size) => <option key={size} value={size}>{size}</option>)}
                </select>
              </label>
            </div>
          )}
        </div>

        <div
          style={{
            width: "clamp(420px, 35vw, 440px)",
            flex: "none",
            background: "#fff",
            border: "1px solid var(--border)",
            borderRadius: 18,
            display: "flex",
            flexDirection: "column",
            alignSelf: "flex-start",
            position: "sticky",
            top: 12,
            // Fixed height: the header and totals stay put, and only the item lines scroll.
            height: "calc(100vh - 100px)",
            minHeight: 460,
            overflow: "hidden",
            boxShadow: "0 2px 10px rgba(20, 48, 31, .045)",
          }}
        >
          <div
            style={{
              padding: "14px 16px 10px",
              display: "flex",
              justifyContent: "space-between",
              borderBottom: "1px solid var(--border-light)",
            }}
          >
            <span style={{ fontSize: 24, fontWeight: 800 }}>
              {orderMode ? "Order summary" : "Current Bill"}
            </span>
            {!orderMode && lines.length > 0 && !resumingSaleId && (
              <button type="button" className="pos-clear-button" onClick={resetCart}>Clear</button>
            )}
            {resumingSaleId && (
              <span className="pill b">Resuming held bill</span>
            )}
          </div>
          <div
            style={{
              flex: 1,
              minHeight: 0,
              overflow: "auto",
              padding: "4px 16px",
            }}
          >
            {lines.map((l) => (
              <div key={l.key} className="row" style={{ alignItems: "center" }}>
                <span>
                  {l.name}
                  {l.unitCodes && (
                    <div className="muted" style={{ fontSize: 12 }}>{l.qty} scanned pack(s)</div>
                  )}
                </span>
                <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  {!resumingSaleId && l.unitCodes && (
                    <>
                      <button
                        type="button"
                        className="btn"
                        title="Remove the last scanned pack"
                        style={{ minHeight: 28, width: 28, padding: 0 }}
                        onClick={() => removeLastPack(l.key)}
                      >
                        −
                      </button>
                      <span style={{ minWidth: 24, textAlign: "center" }}>
                        {l.qty}
                      </span>
                      <button
                        type="button"
                        className="btn"
                        disabled
                        title="Scan the next pack label to add more"
                        style={{ minHeight: 28, width: 28, padding: 0 }}
                      >
                        +
                      </button>
                    </>
                  )}
                  {!resumingSaleId && !l.unitCodes && (
                    <>
                      <button
                        type="button"
                        className="btn"
                        style={{ minHeight: 28, width: 28, padding: 0 }}
                        onClick={() => setQty(l.key, l.qty - 1)}
                      >
                        −
                      </button>
                      <span style={{ minWidth: 24, textAlign: "center" }}>
                        {l.qty}
                      </span>
                      <button
                        type="button"
                        className="btn"
                        style={{ minHeight: 28, width: 28, padding: 0 }}
                        onClick={() => setQty(l.key, l.qty + 1)}
                      >
                        +
                      </button>
                    </>
                  )}
                  {resumingSaleId && <span>{l.qty}</span>}
                  <span className="muted" style={{ minWidth: 64, textAlign: "right", fontSize: 13 }}>
                    {formatPaise(l.mrpPaise)}
                  </span>
                  <span style={{ minWidth: 76, textAlign: "right", fontWeight: 700 }}>
                    {formatPaise(l.mrpPaise * l.qty)}
                  </span>
                  {!resumingSaleId && (
                    <button
                      type="button"
                      aria-label={`Remove ${l.name}`}
                      title="Remove from bill"
                      onClick={() => removeLine(l.key)}
                      style={{ border: 0, background: "transparent", color: "#B42318", cursor: "pointer", minHeight: 34, width: 34, padding: 0, display: "inline-flex", alignItems: "center", justifyContent: "center" }}
                    >
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14" />
                      </svg>
                    </button>
                  )}
                </span>
              </div>
            ))}
            {lines.length === 0 && (
              <div
                className="muted"
                style={{ padding: "20px 0", textAlign: "center" }}
              >
                No items yet
              </div>
            )}
          </div>

          <div
            style={{
              padding: "10px 16px",
              borderTop: "1px solid var(--border)",
              background: "#FAFBF9",
            }}
          >
            <div className="row">
              <span>
                Discount{" "}
                <span className="muted" style={{ fontSize: 12 }}>
                  max {maxDiscountPct}%
                </span>
              </span>
              <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <input
                  className="in"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={maxDiscountPct}
                  aria-label="Discount percent"
                  disabled={!!resumingSaleId}
                  value={discountPct}
                  onChange={(e) =>
                    setDiscountPct(Math.max(0, Math.min(maxDiscountPct, Number(e.target.value) || 0)))
                  }
                  style={{ width: 84, height: 40, textAlign: "right", fontWeight: 700 }}
                />
                <span style={{ fontWeight: 700 }}>%</span>
              </span>
            </div>
            {totals && (
              <>
                <div className="row">
                  <span>Subtotal</span>
                  <span>{formatPaise(totals.grossPaise)}</span>
                </div>
                {totals.discountPaise > 0 && (
                  <div className="row">
                    <span>Discount ({discountPct}%)</span>
                    <span>− {formatPaise(totals.discountPaise)}</span>
                  </div>
                )}
                <div className="row">
                  <span>
                    Tax{" "}
                    <span className="muted" style={{ fontSize: 12 }}>(included in MRP)</span>
                  </span>
                  <span>{formatPaise(totals.taxPaise)}</span>
                </div>
                {totals.roundOffPaise !== 0 && (
                  <div className="row">
                    <span>Round off</span>
                    <span>{formatPaise(totals.roundOffPaise)}</span>
                  </div>
                )}
              </>
            )}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "baseline",
                paddingTop: 6,
              }}
            >
              <span style={{ fontSize: 16, fontWeight: 700 }}>Total</span>
              <span style={{ fontSize: 28, fontWeight: 800, color: "#12301F" }}>
                {totals ? formatPaise(totals.totalPaise) : "–"}
              </span>
            </div>
          </div>

          <div
            style={{
              padding: "12px 16px 16px",
              display: "grid",
              gridTemplateColumns: "repeat(2, minmax(0,1fr))",
              gap: 8,
            }}
          >
            {orderMode ? (
              <button
                className="btn p"
                style={{ gridColumn: "span 2", minHeight: 54 }}
                disabled={!totals || lines.length === 0 || busy}
                onClick={createOrder}
              >
                {busy ? "Creating order…" : "Create order"}
              </button>
            ) : (
              <>
                <button
                  className="btn p pos-pay-button"
                  style={{ gridColumn: "span 2", minHeight: 66 }}
                  disabled={!totals || busy}
                  onClick={() => setShowPaymentMethods(true)}
                >
                  Pay
                </button>
                {!resumingSaleId && (
                  <button
                    className="btn pos-hold-button"
                    style={{ gridColumn: "span 2" }}
                    disabled={lines.length === 0 || busy}
                    onClick={() => startSave("hold")}
                  >
                    Hold bill
                  </button>
                )}
                {resumingSaleId && (
                  <button className="btn" style={{ gridColumn: "span 2" }} onClick={resetCart}>
                    Cancel resume
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {showPaymentMethods && (
        <div className="modal-backdrop" role="presentation" onClick={() => setShowPaymentMethods(false)}>
          <div className="card pos-payment-choice" role="dialog" aria-modal="true" aria-labelledby="pos-payment-title" onClick={(e) => e.stopPropagation()}>
            <h2 id="pos-payment-title">Select payment method</h2>
            <p className="muted">Choose how the customer will pay.</p>
            <div className="pos-payment-choice-actions">
              <button type="button" className="btn p" onClick={() => { setShowPaymentMethods(false); startSave("CASH"); }}>Cash</button>
              <button type="button" className="btn p" onClick={() => { setShowPaymentMethods(false); startSave("UPI"); }}>UPI</button>
            </div>
            <button type="button" className="btn" onClick={() => setShowPaymentMethods(false)}>Cancel</button>
          </div>
        </div>
      )}

      {payDialog && totals && (
        <PaymentDialog
          mode={payDialog}
          totalPaise={totals.totalPaise}
          busy={busy}
          error={error}
          onCancel={() => setPayDialog(null)}
          onConfirm={async (phone) => {
            if (await pay(payDialog, phone)) setPayDialog(null);
          }}
        />
      )}

      {showCamera && (
        <CameraScanner
          onScan={(code) => handleScan(code)}
          onClose={() => setShowCamera(false)}
        />
      )}

      {receipt && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(18,48,31,.55)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div
            className="card"
            style={{ padding: 24, width: 320, textAlign: "center" }}
          >
            <div style={{ fontSize: 14, color: "var(--muted)" }}>Bill</div>
            <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 8 }}>
              {receipt.number}
            </div>
            {receipt.customerPhone && (
              <div style={{ fontSize: 14, color: "var(--muted)", marginBottom: 8 }}>
                Customer: {receipt.customerPhone}
              </div>
            )}
            <div
              style={{
                fontSize: 28,
                fontWeight: 700,
                color: "#12301F",
                marginBottom: 16,
              }}
            >
              {formatPaise(receipt.totalPaise)}
            </div>
            <button
              className="btn p"
              style={{ width: "100%" }}
              onClick={() => setReceipt(null)}
            >
              Done
            </button>
          </div>
        </div>
      )}
    </>
  );
}

// Asks for the customer's mobile number (mandatory), then the payment. For UPI it shows the QR
// code with the exact amount. The cashier must check the payment before completing the sale: a
// static QR cannot confirm a payment on its own.

function PaymentDialog({
  mode,
  totalPaise,
  busy,
  error,
  onCancel,
  onConfirm,
}: {
  mode: "CASH" | "UPI";
  totalPaise: number;
  busy: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: (phone: string) => void;
}) {
  const [phone, setPhone] = useState("");
  const [upi, setUpi] = useState<{ name: string; upiId: string | null; upiQrImageUrl: string | null } | null>(null);
  const [upiStatus, setUpiStatus] = useState<
    "loading" | "ready" | "missing" | "error"
  >("loading");
  const [qr, setQr] = useState<string | null>(null);
  const [qrError, setQrError] = useState(false);

  const phoneValid = /^[6-9]\d{9}$/.test(phone);
  const amount = (totalPaise / 100).toFixed(2);

  // Load business UPI details.
  useEffect(() => {
    if (mode !== "UPI") return;

    let active = true;

    api
      .get<{ name: string; upiId: string | null; upiQrImageUrl: string | null }>("/business-profile")
      .then((profile) => {
        if (!active) return;

        const upiId = profile.upiId?.trim() || "";

        // The QR image uploaded in Settings is shown as it is. Without it, a QR is made from the UPI ID.
        const uploadedQr = profile.upiQrImageUrl || null;
        setUpi({ ...profile, upiId: upiId || null, upiQrImageUrl: uploadedQr });
        setUpiStatus(upiId || uploadedQr ? "ready" : "missing");
      })
      .catch(() => {
        if (active) setUpiStatus("error");
      });

    return () => {
      active = false;
    };
  }, [mode]);

  // Generate QR only when a real business UPI ID exists and no QR image was uploaded.
  useEffect(() => {
    if (mode !== "UPI" || !upi?.upiId || upi.upiQrImageUrl) {
      setQr(null);
      return;
    }

    let active = true;
    setQr(null);
    setQrError(false);

    const uri =
      `upi://pay?pa=${encodeURIComponent(upi.upiId)}` +
      `&pn=${encodeURIComponent(upi.name || "Business")}` +
      `&am=${amount}&cu=INR`;

    QRCode.toDataURL(uri, {
      width: 300,
      margin: 2,
      errorCorrectionLevel: "H",
    })
      .then((data) => {
        if (active) setQr(data);
      })
      .catch(() => {
        if (active) setQrError(true);
      });

    return () => {
      active = false;
    };
  }, [mode, upi, amount]);

  // The QR to show: the uploaded image, or the one made from the UPI ID.
  const shownQr = upi?.upiQrImageUrl || qr;

  const canConfirm =
    phoneValid &&
    !busy &&
    (mode === "CASH" || !!shownQr);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${mode} payment`}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(18,48,31,.60)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
        zIndex: 100,
      }}
    >
      <div
        className="card"
        style={{
          padding: 24,
          width: 430,
          maxWidth: "100%",
          display: "flex",
          flexDirection: "column",
          gap: 16,
          maxHeight: "90vh",
          overflowY: "auto",
        }}
      >
        <div className="row">
          <div>
            <div style={{ fontSize: 20, fontWeight: 700 }}>
              {mode === "CASH" ? "Cash payment" : "UPI payment"}
            </div>
            <div className="muted" style={{ fontSize: 13 }}>
              Complete customer details before checkout
            </div>
          </div>

          <span className="pill g">
            {mode === "CASH" ? "CASH" : "UPI"}
          </span>
        </div>

        <div>
          <label htmlFor="customerPhone" className="lbl">
            Customer mobile number *
          </label>

          <input
            id="customerPhone"
            type="tel"
            className="in"
            style={{ height: 50, fontSize: 17, width: "100%" }}
            inputMode="numeric"
            autoComplete="tel-national"
            maxLength={10}
            autoFocus
            placeholder="Enter 10-digit mobile number"
            value={phone}
            onChange={(e) =>
              setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))
            }
          />

          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 5 }}>
            <span className="muted" style={{ fontSize: 12 }}>
              Required for every sale
            </span>
            <span className="muted" style={{ fontSize: 12 }}>
              {phone.length}/10
            </span>
          </div>

          {phone.length > 0 && !phoneValid && (
            <div style={{ color: "#9B1C1C", fontSize: 13, marginTop: 5 }}>
              Enter a valid 10-digit Indian mobile number.
            </div>
          )}
        </div>

        <div
          style={{
            background: "#F4F7F3",
            borderRadius: 10,
            padding: 16,
          }}
        >
          <div className="muted" style={{ fontSize: 13 }}>
            Amount to collect
          </div>
          <div style={{ fontSize: 32, fontWeight: 800, color: "#12301F" }}>
            ₹{amount}
          </div>
        </div>

        {mode === "UPI" && (
          <div
            style={{
              border: "1px solid var(--border)",
              borderRadius: 12,
              padding: 16,
              textAlign: "center",
            }}
          >
            {upiStatus === "loading" && (
              <div className="muted">Checking UPI configuration…</div>
            )}

            {upiStatus === "missing" && (
              <>
                <div style={{ fontSize: 34, marginBottom: 8 }}>▦</div>
                <div style={{ fontWeight: 700 }}>
                  UPI QR not configured
                </div>
                <div className="muted" style={{ fontSize: 13, marginTop: 6 }}>
                  Upload the UPI QR image, or add your UPI ID, under
                  Settings → Business profile.
                </div>
              </>
            )}

            {upiStatus === "error" && (
              <div style={{ color: "#9B1C1C", fontSize: 13 }}>
                Could not load business payment details. Please try again.
              </div>
            )}

            {upiStatus === "ready" && (
              <>
                {shownQr ? (
                  <>
                    <img
                      src={shownQr}
                      alt="Business UPI payment QR code"
                      style={{
                        width: 240,
                        maxWidth: "100%",
                        display: "block",
                        margin: "0 auto 10px",
                      }}
                    />
                    <div style={{ fontWeight: 700 }}>
                      Scan and pay ₹{amount}
                    </div>
                    <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                      {upi?.upiId}
                    </div>
                  </>
                ) : qrError ? (
                  <div style={{ color: "#9B1C1C", fontSize: 13 }}>
                    Could not generate the QR code. Please try again.
                  </div>
                ) : (
                  <div className="muted">Generating payment QR…</div>
                )}
              </>
            )}
          </div>
        )}

        {mode === "UPI" && shownQr && (
          <div className="muted" style={{ fontSize: 13, lineHeight: 1.6 }}>
            1. Ask the customer to scan the QR code.
            <br />
            2. Verify the exact amount in your payment app or bank account.
            <br />
            3. Complete the sale only after confirming receipt.
          </div>
        )}

        {mode === "CASH" && (
          <div className="muted" style={{ fontSize: 13 }}>
            Collect ₹{amount} in cash and confirm the payment.
          </div>
        )}

        {error && <div className="error-banner">{error}</div>}

        <div style={{ display: "flex", gap: 10 }}>
          <button
            type="button"
            className="btn"
            style={{ flex: 1, minHeight: 48 }}
            onClick={onCancel}
            disabled={busy}
          >
            Cancel
          </button>

          <button
            type="button"
            className="btn p"
            style={{ flex: 1, minHeight: 48 }}
            disabled={!canConfirm}
            onClick={() => onConfirm(phone)}
          >
            {busy
              ? "Saving…"
              : mode === "CASH"
                ? "Confirm Cash"
                : "Payment Received"}
          </button>
        </div>
      </div>
    </div>
  );
}

