import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Channel } from '@farm-sales/shared';
import { api, ApiError } from '../lib/api.js';
import { formatDate, formatPaise } from '../lib/format.js';
import { formatAddress } from '../lib/address.js';
import { BillSheet } from './BillPage.js';
import { FilterToolbar } from '../components/FilterToolbar.js';
import { OrderFilterDrawer } from '../components/OrderFilterDrawer.js';
import {
  DEFAULT_ORDER_FILTERS,
  ORDER_STATUS_OPTIONS,
  countActiveOrderFilters,
  describeOrderFilters,
  filterOrders,
  searchOrders,
  type OrderFilters,
} from '../lib/order-filters.js';

interface Zone { id: string; name: string }
interface OrderLine { id: string; itemId: string; qty: string; mrpPaise: number; item: { name: string; size?: string | null }; batches?: { batch: { code: string }; qty: string }[] }
interface OrderRow {
  id: string; code: string; channel: Channel; salesPoint: 'MARKET_STALL' | 'WAREHOUSE_COUNTER';
  status: 'NEW' | 'PACKED' | 'DISPATCHED' | 'DELIVERED' | 'CANCELLED';
  paymentPlan: 'PREPAID' | 'COD' | 'UPI_ON_DELIVERY'; customerName: string; customerPhone?: string | null;
  deliveryAddress?: string | null; deliveryLandmark?: string | null; deliveryCity?: string | null; deliveryState?: string | null; deliveryPincode?: string | null; zone: Zone | null; totalPaise: number; grossPaise: number;
  discountPaise: number; taxPaise: number; deliveryChargePaise: number; cancelReason: string | null;
  collectedMode: 'CASH' | 'UPI' | 'ALREADY_PAID' | null; collectedAmountPaise?: number | null;
  cashHandedOverAt: string | null; deliveryStaffName: string | null;
  sale: { id: string; number: string } | null; lines: OrderLine[]; createdAt?: string;
  prepaidMode?: string | null; prepaidReference?: string | null;
}

type SectionKey = 'customer' | 'items' | 'information' | 'amount' | 'delivery';
type CollectMode = 'CASH' | 'UPI' | 'ALREADY_PAID';

const channelLabels: Record<Channel, string> = { WALK_IN: 'Walk-in', PHONE: 'Phone', ONLINE: 'Online', EMAIL: 'Email', SOCIAL: 'Social' };
const statusLabel: Record<OrderRow['status'], string> = { NEW: 'New', PACKED: 'Packed', DISPATCHED: 'Out for delivery', DELIVERED: 'Delivered', CANCELLED: 'Cancelled' };
const progressSteps: { key: OrderRow['status']; label: string }[] = [
  { key: 'NEW', label: 'Received' },
  { key: 'PACKED', label: 'Packed' },
  { key: 'DISPATCHED', label: 'Out for delivery' },
  { key: 'DELIVERED', label: 'Delivered' },
];
const paymentPlanLabel = (o: OrderRow) =>
  o.paymentPlan === 'COD' ? 'Cash on delivery' : o.paymentPlan === 'PREPAID' ? 'Prepaid' : 'UPI on delivery';

const green = '#1F6B45';
const ink = '#12301F';
const danger = '#B42318';

function statusClass(status: OrderRow['status']) {
  if (status === 'NEW') return 'pill b';
  if (status === 'PACKED') return 'pill a';
  if (status === 'DELIVERED') return 'pill g';
  if (status === 'CANCELLED') return 'pill rd';
  return 'pill n';
}

// Where the order is, as a row of steps. A cancelled order is shown as a banner instead.
function Progress({ status }: { status: OrderRow['status'] }) {
  const current = progressSteps.findIndex((s) => s.key === status);
  return (
    <ol aria-label="Order progress" style={{ display: 'flex', listStyle: 'none', margin: 0, padding: 0 }}>
      {progressSteps.map((step, i) => {
        const done = i < current || status === 'DELIVERED';
        const active = i === current && status !== 'DELIVERED';
        const reached = done || active;
        return (
          <li key={step.key} aria-current={active ? 'step' : undefined} style={{ flex: 1, position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, textAlign: 'center' }}>
            {i > 0 && <span aria-hidden style={{ position: 'absolute', top: 13, left: '-50%', right: '50%', height: 2, background: i <= current || status === 'DELIVERED' ? green : '#D9DFD6' }} />}
            <span
              aria-hidden
              style={{
                position: 'relative', width: 28, height: 28, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 13, fontWeight: 700, background: reached ? green : '#fff', color: reached ? '#fff' : '#7A8A80',
                border: reached ? `2px solid ${green}` : '2px solid #D9DFD6', boxShadow: active ? '0 0 0 4px #DDEFE4' : 'none',
              }}
            >
              {done ? '✓' : i + 1}
            </span>
            <span style={{ fontSize: 12.5, fontWeight: active ? 700 : 500, color: reached ? ink : '#7A8A80', lineHeight: 1.2 }}>{step.label}</span>
          </li>
        );
      })}
    </ol>
  );
}

// One collapsible part of the details. The header is a button, so it works with the keyboard.
function Section({
  id,
  title,
  summary,
  open,
  onToggle,
  children,
}: {
  id: SectionKey;
  title: string;
  summary?: string;
  open: boolean;
  onToggle: (id: SectionKey) => void;
  children: React.ReactNode;
}) {
  return (
    <section style={{ borderTop: '1px solid #E6EBE4' }}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={`order-section-${id}`}
        onClick={() => onToggle(id)}
        style={{ width: '100%', minHeight: 52, display: 'flex', alignItems: 'center', gap: 10, padding: '0 20px', background: 'none', border: 0, textAlign: 'left', cursor: 'pointer', color: ink }}
      >
        <span style={{ flex: 1, fontSize: 15, fontWeight: 700 }}>{title}</span>
        {summary && <span className="muted" style={{ fontSize: 13 }}>{summary}</span>}
        <span aria-hidden style={{ color: '#5C6E63', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .15s', fontSize: 13 }}>▼</span>
      </button>
      {open && <div id={`order-section-${id}`} style={{ padding: '2px 20px 18px' }}>{children}</div>}
    </section>
  );
}

// A label and its value on one line.
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 16, padding: '7px 0', borderBottom: '1px dashed #E6EBE4' }}>
      <span className="muted" style={{ fontSize: 13.5 }}>{label}</span>
      <span style={{ fontSize: 14, fontWeight: 600, textAlign: 'right' }}>{children}</span>
    </div>
  );
}

export function OrdersPage() {
  const navigate = useNavigate();
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [selected, setSelected] = useState<OrderRow | null>(null);
  const [filters, setFilters] = useState<OrderFilters>(DEFAULT_ORDER_FILTERS);
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [openSections, setOpenSections] = useState<Record<SectionKey, boolean>>({ customer: true, items: true, information: false, amount: false, delivery: false });
  const [staffName, setStaffName] = useState('');
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [collectMode, setCollectMode] = useState<CollectMode>('CASH');
  const [collectAmount, setCollectAmount] = useState('');
  const [failedOpen, setFailedOpen] = useState(false);
  const [failedReason, setFailedReason] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ text: string; saleId?: string } | null>(null);
  const [billSaleId, setBillSaleId] = useState<string | null>(null);

  async function load(keepSelectedId?: string) {
    try {
      const data = await api.get<OrderRow[]>('/orders');
      setOrders(data);
      const id = keepSelectedId ?? selected?.id;
      if (id) setSelected(data.find((order) => order.id === id) ?? null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load orders');
    }
  }

  useEffect(() => { void load(); }, []);

  // A different order starts with its default sections and empty forms.
  useEffect(() => {
    setOpenSections({ customer: true, items: true, information: false, amount: false, delivery: false });
    setStaffName(selected?.deliveryStaffName ?? '');
    setCancelOpen(false);
    setCancelReason('');
    setFailedOpen(false);
    setFailedReason('');
    setFormError(null);
    setNotice(null);
    setCollectMode('CASH');
    setCollectAmount(selected ? (selected.totalPaise / 100).toFixed(2) : '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id]);

  const counts = useMemo(() => ({
    ALL: orders.length,
    NEW: orders.filter((o) => o.status === 'NEW').length,
    PACKED: orders.filter((o) => o.status === 'PACKED').length,
    DISPATCHED: orders.filter((o) => o.status === 'DISPATCHED').length,
    DELIVERED: orders.filter((o) => o.status === 'DELIVERED').length,
    CANCELLED: orders.filter((o) => o.status === 'CANCELLED').length,
  }), [orders]);

  const visibleOrders = useMemo(() => searchOrders(filterOrders(orders, filters), search), [orders, filters, search]);

  function toggleSection(id: SectionKey) {
    setOpenSections((s) => ({ ...s, [id]: !s[id] }));
  }

  // Runs one order action, then reloads the order so the panel shows the new status.
  async function run(id: string, action: () => Promise<unknown>, failText: string) {
    setError(null);
    setFormError(null);
    setBusyId(id);
    try {
      await action();
      await load(id);
      return true;
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : failText);
      return false;
    } finally {
      setBusyId(null);
    }
  }

  async function pack(order: OrderRow) {
    await run(order.id, () => api.post(`/orders/${order.id}/pack`), 'Could not pack the order');
  }

  async function dispatch(order: OrderRow) {
    setNotice(null);
    await run(order.id, async () => {
      const updated = await api.post<OrderRow>(`/orders/${order.id}/dispatch`, { deliveryStaffName: staffName.trim() || undefined });
      if (updated.sale) setNotice({ text: `Bill ${updated.sale.number} created. The order is out for delivery.`, saleId: updated.sale.id });
    }, 'Could not dispatch the order');
  }

  async function cancel(order: OrderRow, reason?: string) {
    const ok = await run(order.id, () => api.post(`/orders/${order.id}/cancel`, { reason: reason?.trim() || undefined }), 'Could not cancel the order');
    if (ok) setCancelOpen(false);
  }

  // Records the delivery. For cash or UPI the amount must equal the order total.
  async function recordDelivery(order: OrderRow) {
    if (collectMode !== 'ALREADY_PAID') {
      const rupees = Number(collectAmount);
      if (!collectAmount.trim() || !Number.isFinite(rupees) || rupees <= 0) {
        setFormError('Enter the amount collected, more than zero');
        return;
      }
      if (Math.round(rupees * 100) !== order.totalPaise) {
        setFormError(`The amount should be ${formatPaise(order.totalPaise)}, the order total`);
        return;
      }
    }
    await run(order.id, () => api.post(`/orders/${order.id}/record-delivery`, {
      collectedMode: collectMode,
      collectedAmountPaise: collectMode === 'ALREADY_PAID' ? undefined : Math.round(Number(collectAmount) * 100),
    }), 'Could not record the delivery');
  }

  async function deliveryFailed(order: OrderRow) {
    if (!failedReason.trim()) {
      setFormError('Enter the reason the delivery failed');
      return;
    }
    await cancel(order, failedReason);
  }

  async function markCashReceived(order: OrderRow) {
    await run(order.id, () => api.post(`/orders/${order.id}/mark-cash-received`), 'Could not mark the cash received');
  }

  // The one thing to do next for this order, with its own inputs. Shown at the top of the panel.
  function nextStep(order: OrderRow) {
    const busy = busyId === order.id;
    const cancelLink = (
      <button type="button" disabled={busy} onClick={() => { setCancelOpen(true); setFormError(null); }} style={{ background: 'none', border: 0, color: danger, fontWeight: 600, cursor: 'pointer', minHeight: 44, padding: '0 6px' }}>
        Cancel order
      </button>
    );
    const cancelBox = cancelOpen && (
      <div style={{ marginTop: 14, padding: 14, background: '#fff', border: `1px solid ${danger}`, borderRadius: 10, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <label htmlFor="cancelReason" style={{ fontSize: 13.5, fontWeight: 700 }}>Why is this order being cancelled? (optional)</label>
        <input id="cancelReason" className="in" style={{ minHeight: 44 }} value={cancelReason} maxLength={200} onChange={(e) => setCancelReason(e.target.value)} />
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          <button type="button" className="btn" style={{ minHeight: 44 }} onClick={() => setCancelOpen(false)}>Keep order</button>
          <button type="button" className="btn" style={{ minHeight: 44, background: danger, borderColor: danger, color: '#fff' }} disabled={busy} onClick={() => void cancel(order, cancelReason)}>
            {busy ? 'Cancelling…' : 'Cancel order'}
          </button>
        </div>
      </div>
    );

    if (order.status === 'NEW') {
      return (
        <>
          <div style={{ fontSize: 17, fontWeight: 700, color: ink }}>Pack this order</div>
          <p className="muted" style={{ margin: '6px 0 16px', fontSize: 14, lineHeight: 1.5 }}>
            Packing picks the stock for each item, oldest batch first, and reserves it for this order.
          </p>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}>
            <button type="button" className="btn p" style={{ minHeight: 48, padding: '0 22px', fontSize: 15 }} disabled={busy} onClick={() => void pack(order)}>
              {busy ? 'Packing…' : 'Pack order'}
            </button>
            {cancelLink}
          </div>
          {cancelBox}
        </>
      );
    }

    if (order.status === 'PACKED') {
      return (
        <>
          <div style={{ fontSize: 17, fontWeight: 700, color: ink }}>Dispatch this order</div>
          <p className="muted" style={{ margin: '6px 0 14px', fontSize: 14, lineHeight: 1.5 }}>
            Dispatching creates the bill and marks the order out for delivery.
          </p>
          <label htmlFor="staffName" style={{ display: 'block', fontSize: 13.5, fontWeight: 600, marginBottom: 6 }}>
            Delivery person <span className="muted" style={{ fontWeight: 400 }}>(optional)</span>
          </label>
          <input id="staffName" className="in" style={{ width: '100%', minHeight: 46 }} value={staffName} maxLength={60} placeholder="Name of the person delivering" onChange={(e) => setStaffName(e.target.value)} />
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', marginTop: 16 }}>
            <button type="button" className="btn p" style={{ minHeight: 48, padding: '0 22px', fontSize: 15 }} disabled={busy} onClick={() => void dispatch(order)}>
              {busy ? 'Dispatching…' : 'Dispatch and create bill'}
            </button>
            {cancelLink}
          </div>
          {cancelBox}
        </>
      );
    }

    if (order.status === 'DISPATCHED') {
      const amountHint = `Order total ${formatPaise(order.totalPaise)}`;
      const options: { value: CollectMode; label: string }[] = [
        { value: 'CASH', label: 'Cash' },
        { value: 'UPI', label: 'UPI' },
        { value: 'ALREADY_PAID', label: 'Already paid' },
      ];
      return (
        <>
          <div style={{ fontSize: 17, fontWeight: 700, color: ink }}>Record the delivery</div>
          <p className="muted" style={{ margin: '6px 0 14px', fontSize: 14, lineHeight: 1.5 }}>
            How did the customer pay?
          </p>
          <div role="radiogroup" aria-label="How was it paid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }}>
            {options.map((o) => {
              const on = collectMode === o.value;
              return (
                <button
                  key={o.value}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => setCollectMode(o.value)}
                  style={{ minHeight: 52, borderRadius: 10, cursor: 'pointer', fontWeight: 700, fontSize: 14.5, background: on ? green : '#fff', color: on ? '#fff' : ink, border: on ? `2px solid ${green}` : '1px solid #C9D3CB' }}
                >
                  {o.label}
                </button>
              );
            })}
          </div>
          {collectMode !== 'ALREADY_PAID' && (
            <div style={{ marginTop: 14 }}>
              <label htmlFor="collectAmount" style={{ display: 'block', fontSize: 13.5, fontWeight: 600, marginBottom: 6 }}>Amount collected (₹)</label>
              <input id="collectAmount" className="in" inputMode="decimal" style={{ width: '100%', minHeight: 46, fontSize: 16 }} value={collectAmount} onChange={(e) => setCollectAmount(e.target.value)} />
              <div className="muted" style={{ fontSize: 12.5, marginTop: 4 }}>{amountHint}</div>
            </div>
          )}
          {collectMode === 'CASH' && (
            <div className="muted" style={{ fontSize: 12.5, marginTop: 10 }}>Cash stays with the delivery person until the office marks it received.</div>
          )}
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', marginTop: 16 }}>
            <button type="button" className="btn p" style={{ minHeight: 48, padding: '0 22px', fontSize: 15 }} disabled={busy} onClick={() => void recordDelivery(order)}>
              {busy ? 'Saving…' : 'Mark delivered'}
            </button>
            {!failedOpen && (
              <button type="button" onClick={() => { setFailedOpen(true); setFormError(null); }} style={{ background: 'none', border: 0, color: danger, fontWeight: 600, cursor: 'pointer', minHeight: 44, padding: '0 6px' }}>
                Delivery failed
              </button>
            )}
          </div>
          {failedOpen && (
            <div style={{ marginTop: 14, padding: 14, background: '#fff', border: `1px solid ${danger}`, borderRadius: 10, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <label htmlFor="failedReason" style={{ fontSize: 13.5, fontWeight: 700 }}>Why did the delivery fail?</label>
              <input id="failedReason" className="in" style={{ minHeight: 44 }} value={failedReason} maxLength={200} placeholder="For example: customer not reachable" onChange={(e) => setFailedReason(e.target.value)} />
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                <button type="button" className="btn" style={{ minHeight: 44 }} onClick={() => setFailedOpen(false)}>Back</button>
                <button type="button" className="btn" style={{ minHeight: 44, background: danger, borderColor: danger, color: '#fff' }} disabled={busy} onClick={() => void deliveryFailed(order)}>
                  Confirm failed delivery
                </button>
              </div>
            </div>
          )}
        </>
      );
    }

    if (order.status === 'DELIVERED') {
      const cashPending = order.collectedMode === 'CASH' && !order.cashHandedOverAt;
      if (cashPending) {
        return (
          <>
            <div style={{ fontSize: 17, fontWeight: 700, color: ink }}>Hand over the cash</div>
            <p className="muted" style={{ margin: '6px 0 14px', fontSize: 14, lineHeight: 1.5 }}>
              {formatPaise(order.collectedAmountPaise ?? order.totalPaise)} was collected in cash. Mark it once it reaches the office.
            </p>
            <button type="button" className="btn p" style={{ minHeight: 48, padding: '0 22px', fontSize: 15 }} disabled={busy} onClick={() => void markCashReceived(order)}>
              {busy ? 'Saving…' : 'Mark cash received'}
            </button>
          </>
        );
      }
      return (
        <div style={{ fontSize: 15, fontWeight: 700, color: green }}>
          ✓ Delivered
          <span className="muted" style={{ fontWeight: 400, fontSize: 13.5, marginLeft: 8, color: '#4E5F55' }}>
            {order.collectedMode === 'ALREADY_PAID' ? 'Already paid' : order.collectedMode ? `Collected by ${order.collectedMode === 'CASH' ? 'cash' : 'UPI'}` : 'No payment recorded'}
          </span>
        </div>
      );
    }

    return null;
  }

  return (
    <>
      <div className="top">
        <div><h1>Fulfilments</h1><div className="muted" style={{ fontSize: 12 }}>Manage incoming orders and fulfilment</div></div>
        <div style={{ flex: 1 }} />
      </div>
      <div className="body" style={{ flexDirection: 'column', gap: 16 }}>
        {error && <div className="error-banner">{error}</div>}
        <div className="order-desk-summary" style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0, 1fr))', gap: 10 }}>
          {ORDER_STATUS_OPTIONS.slice(1).map((s) => <button key={s.value} type="button" className="card" onClick={() => setFilters({ ...filters, status: s.value })} style={{ textAlign: 'left', padding: '13px 15px', borderColor: filters.status === s.value ? 'var(--accent)' : 'var(--border)', background: filters.status === s.value ? 'var(--accent-bg)' : '#fff' }}>
            <div className="muted" style={{ fontSize: 12, fontWeight: 600 }}>{s.label}</div><div style={{ fontSize: 24, fontWeight: 700, marginTop: 4 }}>{counts[s.value as keyof typeof counts]}</div>
          </button>)}
        </div>
        <section className="card" style={{ display: 'flex', flexDirection: 'column', minHeight: 0, flex: 1, overflow: 'hidden' }}>
          <FilterToolbar
            leading="Orders"
            actions={<button type="button" className="btn p" onClick={() => navigate('/pos?mode=order')}>＋ New order</button>}
            search={search}
            onSearch={setSearch}
            searchLabel="Search orders"
            searchPlaceholder="Search order, customer or phone"
            activeCount={countActiveOrderFilters(filters)}
            chips={describeOrderFilters(filters).map((chip) => ({
              key: chip.key,
              label: chip.label,
              onRemove: () => setFilters({ ...filters, ...chip.patch }),
            }))}
            onClearAll={() => setFilters(DEFAULT_ORDER_FILTERS)}
            shown={visibleOrders.length}
            total={orders.length}
            noun="orders"
            renderDrawer={(close) => (
              <OrderFilterDrawer
                initial={filters}
                search={search}
                orders={orders}
                onClose={close}
                onApply={(next) => {
                  setFilters(next);
                  close();
                }}
              />
            )}
          />
          <div style={{ overflow: 'auto', flex: 1 }}>
            <table className="tbl order-desk-table">
              <thead><tr><th>Order</th><th>Customer</th><th>Channel</th><th>Items</th><th>Payment</th><th className="r">Total</th><th>Status</th><th /></tr></thead>
              <tbody>
                {visibleOrders.map((order) => <tr key={order.id} onClick={() => setSelected(order)} className={selected?.id === order.id ? 'sel' : ''} style={{ cursor: 'pointer' }}>
                  <td><strong>{order.code}</strong><div className="muted" style={{ fontSize: 11 }}>{order.createdAt ? new Date(order.createdAt).toLocaleString('en-IN') : ''}</div></td>
                  <td>{order.customerName}<div className="muted" style={{ fontSize: 12 }}>{order.customerPhone || 'No phone'}</div></td>
                  <td>{channelLabels[order.channel]}</td><td>{order.lines.length} item(s)</td>
                  <td>{paymentPlanLabel(order)}</td>
                  <td className="r"><strong>{formatPaise(order.totalPaise)}</strong></td><td><span className={statusClass(order.status)}>{statusLabel[order.status]}</span></td>
                  <td><button className="btn" style={{ minHeight: 36, padding: '0 12px' }} onClick={(e) => { e.stopPropagation(); setSelected(order); }}>Open</button></td>
                </tr>)}
                {visibleOrders.length === 0 && <tr><td colSpan={8} style={{ textAlign: 'center', padding: 40 }}><div style={{ fontWeight: 600 }}>No orders found</div><div className="muted" style={{ marginTop: 5 }}>Try changing the filters or search.</div></td></tr>}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      {selected && <div role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) setSelected(null); }} style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(13, 29, 20, .28)', display: 'flex', justifyContent: 'flex-end' }}>
        <aside role="dialog" aria-modal="true" aria-label={`Order ${selected.code} details`} style={{ width: 'min(580px, 100vw)', height: '100%', background: '#F7F9F6', boxShadow: '-12px 0 40px rgba(0,0,0,.14)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <header style={{ background: '#fff', padding: '18px 20px 16px', borderBottom: '1px solid #E6EBE4' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <h2 style={{ margin: 0, fontSize: 21 }}>{selected.code}</h2>
                  <span className={statusClass(selected.status)}>{statusLabel[selected.status]}</span>
                </div>
                <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>
                  {selected.customerName}{selected.createdAt ? ` · ${formatDate(selected.createdAt)}` : ''}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div className="muted" style={{ fontSize: 12 }}>Total</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: ink }}>{formatPaise(selected.totalPaise)}</div>
              </div>
              <button className="btn" aria-label="Close details" onClick={() => setSelected(null)} style={{ minHeight: 44, minWidth: 44 }}>✕</button>
            </div>
            <div style={{ marginTop: 16 }}>
              {selected.status === 'CANCELLED'
                ? <div role="status" style={{ padding: '10px 12px', borderRadius: 10, background: '#FDECEA', color: danger, fontWeight: 600, fontSize: 14 }}>
                    This order was cancelled{selected.cancelReason ? `: ${selected.cancelReason}` : '.'}
                  </div>
                : <Progress status={selected.status} />}
            </div>
          </header>

          <div style={{ overflowY: 'auto', flex: 1 }}>
            <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
              {notice && (
                <div role="status" style={{ padding: 12, borderRadius: 10, background: '#E8F3EC', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <span style={{ flex: 1, fontWeight: 600, color: '#14502F', fontSize: 14 }}>{notice.text}</span>
                  {notice.saleId && <button type="button" className="btn" style={{ minHeight: 40 }} onClick={() => setBillSaleId(notice.saleId!)}>View bill</button>}
                </div>
              )}
              {formError && <div role="alert" className="error-banner">{formError}</div>}

              {selected.status !== 'CANCELLED' && (
                <div style={{ background: '#fff', border: '1px solid #DCE5DC', borderRadius: 14, padding: 18, boxShadow: '0 1px 2px rgba(18,48,31,.04)' }}>
                  {nextStep(selected)}
                </div>
              )}
            </div>

            <div style={{ background: '#fff', borderTop: '1px solid #E6EBE4', marginTop: 4 }}>
              <Section id="customer" title="Customer" summary={selected.customerPhone || undefined} open={openSections.customer} onToggle={toggleSection}>
                <Field label="Name">{selected.customerName}</Field>
                <Field label="Mobile">{selected.customerPhone || 'Not given'}</Field>
                <Field label="Delivery address">{formatAddress(selected) || 'Pickup, no delivery'}</Field>
                {selected.zone && <Field label="Delivery zone">{selected.zone.name}</Field>}
              </Section>

              <Section id="items" title="Items" summary={`${selected.lines.length} item${selected.lines.length === 1 ? '' : 's'}`} open={openSections.items} onToggle={toggleSection}>
                {selected.lines.map((line) => (
                  <div key={line.id} style={{ padding: '10px 0', borderBottom: '1px solid #EEF2EC', display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: 14.5 }}>{line.item.name}{line.item.size ? ` · ${line.item.size}` : ''}</div>
                      <div className="muted" style={{ fontSize: 12.5, marginTop: 2 }}>
                        {Number(line.qty)} × {formatPaise(line.mrpPaise)}
                        {line.batches?.length ? ` · Batch ${line.batches.map((b) => b.batch.code).join(', ')}` : ''}
                      </div>
                    </div>
                    <div style={{ fontWeight: 700, fontSize: 14.5, whiteSpace: 'nowrap' }}>{formatPaise(line.mrpPaise * Number(line.qty))}</div>
                  </div>
                ))}
              </Section>

              <Section id="amount" title="Amount" summary={formatPaise(selected.totalPaise)} open={openSections.amount} onToggle={toggleSection}>
                <Field label="Gross">{formatPaise(selected.grossPaise)}</Field>
                {selected.discountPaise > 0 && <Field label="Discount">− {formatPaise(selected.discountPaise)}</Field>}
                <Field label="Tax">{formatPaise(selected.taxPaise)}</Field>
                <Field label="Delivery charge">{formatPaise(selected.deliveryChargePaise)}</Field>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0 0', fontWeight: 800, fontSize: 15 }}>
                  <span>Total</span><span>{formatPaise(selected.totalPaise)}</span>
                </div>
              </Section>

              <Section id="information" title="Order information" open={openSections.information} onToggle={toggleSection}>
                <Field label="Order number">{selected.code}</Field>
                <Field label="Channel">{channelLabels[selected.channel]}</Field>
                <Field label="Sales point">{selected.salesPoint === 'WAREHOUSE_COUNTER' ? 'Warehouse counter' : 'Market stall'}</Field>
                <Field label="Payment plan">{selected.paymentPlan === 'PREPAID' ? `Prepaid${selected.prepaidMode ? ` · ${selected.prepaidMode}` : ''}` : paymentPlanLabel(selected)}</Field>
                {selected.prepaidReference && <Field label="Payment reference">{selected.prepaidReference}</Field>}
                {selected.sale && <Field label="Bill">
                  <button type="button" className="btn" style={{ minHeight: 36, padding: '0 12px' }} onClick={() => setBillSaleId(selected.sale!.id)}>{selected.sale.number} · View</button>
                </Field>}
              </Section>

              <Section id="delivery" title="Delivery" summary={selected.zone ? selected.zone.name : 'Pickup'} open={openSections.delivery} onToggle={toggleSection}>
                <Field label="Delivery person">{selected.deliveryStaffName || 'Not assigned'}</Field>
                <Field label="Zone">{selected.zone ? selected.zone.name : 'Pickup'}</Field>
                <Field label="Delivery charge">{formatPaise(selected.deliveryChargePaise)}</Field>
                {selected.status === 'DELIVERED' && <>
                  <Field label="Collected">{selected.collectedMode === 'ALREADY_PAID' ? 'Already paid' : selected.collectedMode || 'Not recorded'}</Field>
                  {selected.collectedAmountPaise ? <Field label="Amount">{formatPaise(selected.collectedAmountPaise)}</Field> : null}
                  {selected.collectedMode === 'CASH' && <Field label="Cash to office">{selected.cashHandedOverAt ? `Received ${formatDate(selected.cashHandedOverAt)}` : 'Pending'}</Field>}
                </>}
              </Section>
            </div>
          </div>
        </aside>
      </div>}

      {billSaleId && (
        <div role="dialog" aria-modal="true" aria-label="Bill" onMouseDown={(e) => { if (e.target === e.currentTarget) setBillSaleId(null); }} style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(13, 29, 20, .45)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '24px 16px', overflowY: 'auto' }}>
          <BillSheet saleId={billSaleId} onClose={() => setBillSaleId(null)} />
        </div>
      )}
    </>
  );
}
