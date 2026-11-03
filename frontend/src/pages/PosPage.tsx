import { useEffect, useMemo, useRef, useState } from "react";
import QRCode from "qrcode";
import { calcBillTotals, isExpired, type Channel } from "@farm-sales/shared";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api, ApiError } from "../lib/api.js";
import { formatPaise } from "../lib/format.js";
import { CameraScanner } from "../components/CameraScanner.js";

type PosChannel = Channel;
interface CustomerOption {
  id: string;
  name: string;
}
interface ZoneOption {
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
  const [customerId, setCustomerId] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [zoneId, setZoneId] = useState("");
  const [paymentPlan, setPaymentPlan] = useState<
    "COD" | "PREPAID" | "UPI_ON_DELIVERY"
  >("COD");
  const [prepaidMode, setPrepaidMode] = useState<"CASH" | "UPI">("UPI");
  const [prepaidReference, setPrepaidReference] = useState("");
  const [items, setItems] = useState<SellableItem[]>([]);
  const [taxClasses, setTaxClasses] = useState<Record<string, TaxClass>>({});
  const [channelDiscounts, setChannelDiscounts] = useState<
    Record<Channel, ChannelDiscountRow>
  >({} as never);
  const [search, setSearch] = useState("");
  const [scanValue, setScanValue] = useState("");
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
    const [itemList, taxClassList, discountList, held] = await Promise.all([
      api.get<SellableItem[]>("/items?active=true"),
      api.get<TaxClass[]>("/tax-classes"),
      api.get<ChannelDiscountRow[]>("/channel-discounts"),
      api.get<HeldSale[]>("/sales/held"),
    ]);
    setItems(itemList);
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

  // Used by the Add button and the Enter key in the manual entry box.
  function submitManualCode() {
    const value = scanValue;
    setScanValue("");
    handleScan(value);
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
        setError(
          `Batch ${batch.code} is sold by the label on each pack. Scan one pack label (for example ${batch.code}-0001).`,
        );
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

  const filteredItems = items.filter((i) =>
    `${i.name} ${i.code}`.toLowerCase().includes(search.toLowerCase()),
  );

  function addItemToOrder(item: SellableItem) {
    setError(null);
    setLines((prev) => {
      const existing = prev.find(
        (line) => line.itemId === item.id && !line.unitCodes,
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
          name: item.size ? `${item.name} ${item.size}` : item.name,
          mrpPaise: item.mrpPaise ?? 0,
          taxRatePct: taxRateByClass(item.taxClassId),
          qty: 1,
        },
      ];
    });
  }

  async function createOrder() {
    if (!totals || lines.length === 0) return;
    if (!customerName.trim()) {
      setError("Please enter the customer name");
      return;
    }
    setError(null);
    setBusy(true);
    try {
      await api.post("/orders", {
        channel,
        salesPoint: "WAREHOUSE_COUNTER",
        paymentPlan,
        prepaidMode: paymentPlan === "PREPAID" ? prepaidMode : undefined,
        prepaidReference:
          paymentPlan === "PREPAID"
            ? prepaidReference.trim() || undefined
            : undefined,
        customerId: customerId || undefined,
        customerName: customerName.trim(),
        customerPhone: customerPhone.trim() || undefined,
        deliveryAddress: deliveryAddress.trim() || undefined,
        zoneId: zoneId || undefined,
        discountPct,
        lines: lines.map((line) => ({ itemId: line.itemId, qty: line.qty })),
      });
      resetCart();
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
  function billLines() {
    return lines.map((l) => ({
      itemId: l.itemId,
      qty: l.qty,
      batchId: l.batchId,
      unitCodes: l.unitCodes,
    }));
  }

  async function handleHold() {
    setError(null);
    setBusy(true);
    try {
      await api.post("/sales/hold", {
        salesPoint: "WAREHOUSE_COUNTER",
        channel,
        discountPct,
        lines: billLines(),
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
            salesPoint: "WAREHOUSE_COUNTER",
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
        <div
          className="row"
          style={{
            display: "flex",
            background: "#EEF1EC",
            borderRadius: 10,
            padding: 3,
            gap: 2,
          }}
        >
          {orderMode && (
            <div
              className="row"
              style={{
                display: "flex",
                background: "#EEF1EC",
                borderRadius: 10,
                padding: 3,
                gap: 2,
              }}
            >
              {(
                [
                  "WALK_IN",
                  "PHONE",
                  "ONLINE",
                  "EMAIL",
                  "SOCIAL",
                ] as PosChannel[]
              ).map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setChannel(c)}
                  style={{
                    minHeight: 34,
                    padding: "0 14px",
                    border: 0,
                    borderRadius: 8,
                    fontSize: 13,
                    fontWeight: 600,
                    background: channel === c ? "#fff" : "transparent",
                    color: channel === c ? "#12301F" : "#3E4F45",
                  }}
                >
                  {channelLabels[c]}
                </button>
              ))}
            </div>
          )}
        </div>
        <div style={{ flex: 1 }} />
        {orderMode ? (
          <button className="btn" onClick={() => navigate("/orders")}>
            Cancel
          </button>
        ) : (
          <button className="btn" onClick={() => setShowHeld((v) => !v)}>
            Held bills{" "}
            <span className="pill n" style={{ marginLeft: 6 }}>
              {heldSales.length}
            </span>
          </button>
        )}
      </div>
      <div className="body">
        <div
          style={{
            flex: 1,
            minWidth: 0,
            display: "flex",
            flexDirection: "column",
            gap: 12,
          }}
        >
          {!orderMode && (
            <div>
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  ref={scanRef}
                  className="in"
                  style={{ height: 56, fontSize: 18, flex: 1, minWidth: 0 }}
                  placeholder="Scan the pack label, or type its code and press Add"
                  aria-label="Pack label code"
                  value={scanValue}
                  disabled={!!resumingSaleId || busy}
                  onChange={(e) => setScanValue(e.target.value)}
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
                  style={{ minHeight: 56, padding: "0 20px" }}
                  disabled={!scanValue.trim() || !!resumingSaleId || busy}
                  onClick={submitManualCode}
                >
                  Add
                </button>
                <button
                  type="button"
                  className="btn"
                  style={{ minHeight: 56, padding: "0 16px" }}
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
            <div
              className="card order-create-fields"
              style={{
                padding: 14,
                display: "grid",
                gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
                gap: 10,
              }}
            >
              <div>
                <label className="lbl">Customer (optional saved record)</label>
                <select
                  className="in"
                  value={customerId}
                  onChange={(e) => {
                    setCustomerId(e.target.value);
                    const c = customers.find((x) => x.id === e.target.value);
                    if (c) setCustomerName(c.name);
                  }}
                >
                  <option value="">Walk-in / new customer</option>
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="lbl">Customer name *</label>
                <input
                  className="in"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="Customer name"
                />
              </div>
              <div>
                <label className="lbl">Phone</label>
                <input
                  className="in"
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  placeholder="Phone number"
                />
              </div>
              <div>
                <label className="lbl">Payment plan</label>
                <select
                  className="in"
                  value={paymentPlan}
                  onChange={(e) =>
                    setPaymentPlan(e.target.value as typeof paymentPlan)
                  }
                >
                  <option value="COD">Cash on delivery</option>
                  <option value="UPI_ON_DELIVERY">UPI on delivery</option>
                  <option value="PREPAID">Prepaid</option>
                </select>
              </div>
              {paymentPlan === "PREPAID" && (
                <>
                  <div>
                    <label className="lbl">Prepaid via</label>
                    <select
                      className="in"
                      value={prepaidMode}
                      onChange={(e) =>
                        setPrepaidMode(e.target.value as "CASH" | "UPI")
                      }
                    >
                      <option value="UPI">UPI</option>
                      <option value="CASH">Cash</option>
                    </select>
                  </div>
                  <div>
                    <label className="lbl">Payment reference</label>
                    <input
                      className="in"
                      value={prepaidReference}
                      onChange={(e) => setPrepaidReference(e.target.value)}
                    />
                  </div>
                </>
              )}
              <div>
                <label className="lbl">Delivery zone</label>
                <select
                  className="in"
                  value={zoneId}
                  onChange={(e) => setZoneId(e.target.value)}
                >
                  <option value="">Pickup / no zone</option>
                  {zones.map((z) => (
                    <option key={z.id} value={z.id}>
                      {z.name}
                    </option>
                  ))}
                </select>
              </div>
              <div style={{ gridColumn: "span 3" }}>
                <label className="lbl">Delivery address</label>
                <input
                  className="in"
                  value={deliveryAddress}
                  onChange={(e) => setDeliveryAddress(e.target.value)}
                  placeholder="Address (if delivery)"
                />
              </div>
            </div>
          )}
          <input
            className="in"
            style={{ height: 44, fontSize: 15 }}
            placeholder="Search item by name or code"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {error && <div className="error-banner">{error}</div>}
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
              gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
              gap: 10,
              alignContent: "start",
            }}
          >
            {filteredItems.map((item) => (
              <button
                key={item.id}
                type="button"
                className="card"
                onClick={() =>
                  orderMode
                    ? addItemToOrder(item)
                    : setError(
                        `${item.name} is sold by its pack label. Scan the label on the pack.`,
                      )
                }
                style={{
                  textAlign: "left",
                  padding: 12,
                  minHeight: 96,
                  display: "flex",
                  flexDirection: "column",
                  gap: 2,
                }}
              >
                <b>{item.name}</b>
                <span className="muted" style={{ fontSize: 12.5 }}>
                  {item.size ?? item.code}
                </span>
                <div style={{ flex: 1 }} />
                <span style={{ fontWeight: 700 }}>
                  {formatPaise(item.mrpPaise)}
                </span>
              </button>
            ))}
          </div>
        </div>

        <div
          style={{
            width: 392,
            flex: "none",
            background: "#fff",
            border: "1px solid var(--border)",
            borderRadius: 12,
            display: "flex",
            flexDirection: "column",
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
            <span style={{ fontSize: 16, fontWeight: 700 }}>
              {orderMode ? "Order summary" : "Current bill"}
            </span>
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
                  {l.batchCode && (
                    <div className="muted" style={{ fontSize: 12 }}>
                      Batch {l.batchCode} · scanned packs
                    </div>
                  )}
                  {l.unitCodes && (
                    <div className="muted" style={{ fontSize: 12 }}>
                      {l.unitCodes.join(", ")}
                    </div>
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
                  <span style={{ minWidth: 64, textAlign: "right" }}>
                    {formatPaise(l.mrpPaise * l.qty)}
                  </span>
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
                <button
                  type="button"
                  className="btn"
                  disabled={!!resumingSaleId}
                  style={{ minHeight: 28, width: 28, padding: 0 }}
                  onClick={() => setDiscountPct((p) => Math.max(0, p - 1))}
                >
                  −
                </button>
                <span
                  style={{ minWidth: 30, textAlign: "center", fontWeight: 700 }}
                >
                  {discountPct}%
                </span>
                <button
                  type="button"
                  className="btn"
                  disabled={!!resumingSaleId}
                  style={{ minHeight: 28, width: 28, padding: 0 }}
                  onClick={() =>
                    setDiscountPct((p) => Math.min(maxDiscountPct, p + 1))
                  }
                >
                  +
                </button>
              </span>
            </div>
            {totals && (
              <>
                <div className="row">
                  <span>Taxable value</span>
                  <span>{formatPaise(totals.taxablePaise)}</span>
                </div>
                <div className="row">
                  <span>Tax</span>
                  <span>{formatPaise(totals.taxPaise)}</span>
                </div>
                <div className="row">
                  <span>Round-off</span>
                  <span>{formatPaise(totals.roundOffPaise)}</span>
                </div>
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
              <span style={{ fontSize: 30, fontWeight: 700, color: "#12301F" }}>
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
                disabled={
                  !totals || lines.length === 0 || busy || !customerName.trim()
                }
                onClick={createOrder}
              >
                {busy ? "Creating order…" : "Create order"}
              </button>
            ) : (
              <>
                <button
                  className="btn p"
                  style={{ minHeight: 56 }}
                  disabled={!totals || busy}
                  onClick={() => setPayDialog("CASH")}
                >
                  Cash
                </button>
                <button
                  className="btn p"
                  style={{ minHeight: 56 }}
                  disabled={!totals || busy}
                  onClick={() => setPayDialog("UPI")}
                >
                  UPI
                </button>
                {!resumingSaleId && (
                  <button
                    className="btn"
                    style={{ gridColumn: "span 2" }}
                    disabled={lines.length === 0 || busy}
                    onClick={handleHold}
                  >
                    Hold bill
                  </button>
                )}
                {resumingSaleId && (
                  <button
                    className="btn"
                    style={{ gridColumn: "span 2" }}
                    onClick={resetCart}
                  >
                    Cancel resume
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      </div>

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
  const [upi, setUpi] = useState<{ name: string; upiId: string | null } | null>(null);
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
      .get<{ name: string; upiId: string | null }>("/business-profile")
      .then((profile) => {
        if (!active) return;

        const upiId = profile.upiId?.trim() || "";

        setUpi({ ...profile, upiId: upiId || null });
        setUpiStatus(upiId ? "ready" : "missing");
      })
      .catch(() => {
        if (active) setUpiStatus("error");
      });

    return () => {
      active = false;
    };
  }, [mode]);

  // Generate QR only when a real business UPI ID exists.
  useEffect(() => {
    if (mode !== "UPI" || !upi?.upiId) {
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

  const canConfirm =
    phoneValid &&
    !busy &&
    (mode === "CASH" || !!qr);

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
                  Add your business UPI ID under Settings → Business Profile
                  to generate payment QR codes.
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
                {qr ? (
                  <>
                    <img
                      src={qr}
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

        {mode === "UPI" && qr && (
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

