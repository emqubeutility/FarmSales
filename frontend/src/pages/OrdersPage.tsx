import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { Channel } from '@farm-sales/shared';
import { api, ApiError } from '../lib/api.js';
import { formatPaise } from '../lib/format.js';

interface Zone { id: string; name: string }
interface OrderLine { id: string; itemId: string; qty: string; mrpPaise: number; item: { name: string; size?: string | null }; batches?: { batch: { code: string }; qty: string }[] }
interface OrderRow {
  id: string; code: string; channel: Channel; salesPoint: 'MARKET_STALL' | 'WAREHOUSE_COUNTER';
  status: 'NEW' | 'PACKED' | 'DISPATCHED' | 'DELIVERED' | 'CANCELLED';
  paymentPlan: 'PREPAID' | 'COD' | 'UPI_ON_DELIVERY'; customerName: string; customerPhone?: string | null;
  deliveryAddress?: string | null; zone: Zone | null; totalPaise: number; grossPaise: number;
  discountPaise: number; taxPaise: number; deliveryChargePaise: number; cancelReason: string | null;
  collectedMode: 'CASH' | 'UPI' | 'ALREADY_PAID' | null; collectedAmountPaise?: number | null;
  cashHandedOverAt: string | null; deliveryStaffName: string | null;
  sale: { id: string; number: string } | null; lines: OrderLine[]; createdAt?: string;
  prepaidMode?: string | null; prepaidReference?: string | null;
}

const channelLabels: Record<Channel, string> = { WALK_IN: 'Walk-in', PHONE: 'Phone', ONLINE: 'Online', EMAIL: 'Email', SOCIAL: 'Social' };
const statuses: { value: OrderRow['status'] | 'ALL'; label: string }[] = [
  { value: 'ALL', label: 'All orders' }, { value: 'NEW', label: 'New' }, { value: 'PACKED', label: 'Packed' },
  { value: 'DISPATCHED', label: 'Out for delivery' }, { value: 'DELIVERED', label: 'Delivered' }, { value: 'CANCELLED', label: 'Cancelled' },
];
const statusLabel: Record<OrderRow['status'], string> = { NEW: 'New', PACKED: 'Packed', DISPATCHED: 'Out for delivery', DELIVERED: 'Delivered', CANCELLED: 'Cancelled' };

export function OrdersPage() {
  const navigate = useNavigate();
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [selected, setSelected] = useState<OrderRow | null>(null);
  const [filter, setFilter] = useState<OrderRow['status'] | 'ALL'>('ALL');
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

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

  const counts = useMemo(() => ({
    ALL: orders.length,
    NEW: orders.filter((o) => o.status === 'NEW').length,
    PACKED: orders.filter((o) => o.status === 'PACKED').length,
    DISPATCHED: orders.filter((o) => o.status === 'DISPATCHED').length,
    DELIVERED: orders.filter((o) => o.status === 'DELIVERED').length,
    CANCELLED: orders.filter((o) => o.status === 'CANCELLED').length,
  }), [orders]);

  const visibleOrders = useMemo(() => orders.filter((order) => {
    const matchesStatus = filter === 'ALL' || order.status === filter;
    const term = search.trim().toLowerCase();
    const matchesSearch = !term || [order.code, order.customerName, order.customerPhone ?? '', channelLabels[order.channel]]
      .some((value) => value.toLowerCase().includes(term));
    return matchesStatus && matchesSearch;
  }), [orders, filter, search]);

  async function act(id: string, path: string, body?: unknown) {
    setError(null); setBusyId(id);
    try { await api.post(`/orders/${id}/${path}`, body); await load(id); }
    catch (err) { setError(err instanceof ApiError ? err.message : 'Action failed'); }
    finally { setBusyId(null); }
  }

  async function dispatch(order: OrderRow) {
    const staff = window.prompt('Delivery staff name (optional):', '') ?? '';
    setError(null); setBusyId(order.id);
    try {
      const updated = await api.post<OrderRow>(`/orders/${order.id}/dispatch`, { deliveryStaffName: staff.trim() || undefined });
      await load(order.id);
      if (updated.sale) navigate(`/bills/${updated.sale.id}`);
    } catch (err) { setError(err instanceof ApiError ? err.message : 'Could not dispatch order'); }
    finally { setBusyId(null); }
  }

  async function cancel(order: OrderRow) {
    const reason = window.prompt('Reason for cancelling this order:', '');
    if (reason === null) return;
    await act(order.id, 'cancel', { reason: reason.trim() || undefined });
  }

  function statusClass(status: OrderRow['status']) {
    if (status === 'NEW') return 'pill b';
    if (status === 'PACKED') return 'pill a';
    if (status === 'DELIVERED') return 'pill g';
    if (status === 'CANCELLED') return 'pill rd';
    return 'pill n';
  }

  return (
    <>
      <div className="top">
        <div><h1>Fulfilments</h1><div className="muted" style={{ fontSize: 12 }}>Manage incoming orders and fulfilment</div></div>
        <div style={{ flex: 1 }} />
        <button className="btn p" onClick={() => navigate('/pos?mode=order')}>＋ New order</button>
      </div>
      <div className="body" style={{ flexDirection: 'column', gap: 16 }}>
        {error && <div className="error-banner">{error}</div>}
        <div className="order-desk-summary" style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0, 1fr))', gap: 10 }}>
          {statuses.slice(1).map((s) => <button key={s.value} type="button" className="card" onClick={() => setFilter(s.value as OrderRow['status'])} style={{ textAlign: 'left', padding: '13px 15px', borderColor: filter === s.value ? 'var(--accent)' : 'var(--border)', background: filter === s.value ? 'var(--accent-bg)' : '#fff' }}>
            <div className="muted" style={{ fontSize: 12, fontWeight: 600 }}>{s.label}</div><div style={{ fontSize: 24, fontWeight: 700, marginTop: 4 }}>{counts[s.value as keyof typeof counts]}</div>
          </button>)}
        </div>
        <section className="card" style={{ display: 'flex', flexDirection: 'column', minHeight: 0, flex: 1, overflow: 'hidden' }}>
          <div className="order-desk-toolbar" style={{ padding: 14, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', borderBottom: '1px solid var(--border-light)' }}>
            <div style={{ fontWeight: 700 }}>Orders <span className="pill n">{visibleOrders.length}</span></div>
            <div style={{ flex: 1 }} />
            <input className="in" style={{ maxWidth: 320 }} placeholder="Search order, customer or phone" value={search} onChange={(e) => setSearch(e.target.value)} />
            <select className="in" style={{ width: 190 }} value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)}>
              {statuses.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
            <button className="btn" onClick={() => void load()}>Refresh</button>
          </div>
          <div style={{ overflow: 'auto', flex: 1 }}>
            <table className="tbl order-desk-table">
              <thead><tr><th>Order</th><th>Customer</th><th>Channel</th><th>Items</th><th>Payment</th><th className="r">Total</th><th>Status</th><th /></tr></thead>
              <tbody>
                {visibleOrders.map((order) => <tr key={order.id} onClick={() => setSelected(order)} className={selected?.id === order.id ? 'sel' : ''} style={{ cursor: 'pointer' }}>
                  <td><strong>{order.code}</strong><div className="muted" style={{ fontSize: 11 }}>{order.createdAt ? new Date(order.createdAt).toLocaleString('en-IN') : ''}</div></td>
                  <td>{order.customerName}<div className="muted" style={{ fontSize: 12 }}>{order.customerPhone || 'No phone'}</div></td>
                  <td>{channelLabels[order.channel]}</td><td>{order.lines.length} item(s)</td>
                  <td>{order.paymentPlan === 'COD' ? 'Cash on delivery' : order.paymentPlan === 'PREPAID' ? 'Prepaid' : 'UPI on delivery'}</td>
                  <td className="r"><strong>{formatPaise(order.totalPaise)}</strong></td><td><span className={statusClass(order.status)}>{statusLabel[order.status]}</span></td>
                  <td><button className="btn" style={{ minHeight: 32, padding: '0 10px' }} onClick={(e) => { e.stopPropagation(); setSelected(order); }}>View</button></td>
                </tr>)}
                {visibleOrders.length === 0 && <tr><td colSpan={8} style={{ textAlign: 'center', padding: 40 }}><div style={{ fontWeight: 600 }}>No orders found</div><div className="muted" style={{ marginTop: 5 }}>Try changing the status filter or search.</div></td></tr>}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      {selected && <div role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) setSelected(null); }} style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(13, 29, 20, .28)', display: 'flex', justifyContent: 'flex-end' }}>
        <aside role="dialog" aria-modal="true" aria-label={`Order ${selected.code} details`} style={{ width: 'min(540px, 96vw)', height: '100%', background: '#fff', boxShadow: '-12px 0 40px rgba(0,0,0,.12)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <header style={{ padding: '20px 22px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'flex-start', gap: 12 }}>
            <div style={{ flex: 1 }}><div className="muted" style={{ fontSize: 12 }}>ORDER DETAILS</div><h2 style={{ margin: '4px 0 8px', fontSize: 22 }}>{selected.code}</h2><span className={statusClass(selected.status)}>{statusLabel[selected.status]}</span></div>
            <button className="btn" aria-label="Close details" onClick={() => setSelected(null)}>✕</button>
          </header>
          <div style={{ padding: 22, overflow: 'auto', flex: 1 }}>
            <section style={{ marginBottom: 22 }}><h3 style={{ fontSize: 14, margin: '0 0 12px' }}>Customer</h3><div style={{ fontWeight: 700 }}>{selected.customerName}</div><div className="muted" style={{ marginTop: 4 }}>{selected.customerPhone || 'Phone not provided'}</div><div style={{ marginTop: 8, fontSize: 13 }}>{selected.deliveryAddress || 'Pickup / no delivery address'}</div>{selected.zone && <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>Zone: {selected.zone.name}</div>}</section>
            <section style={{ marginBottom: 22 }}><h3 style={{ fontSize: 14, margin: '0 0 10px' }}>Order information</h3><div className="row"><span className="muted">Channel</span><strong>{channelLabels[selected.channel]}</strong></div><div className="row"><span className="muted">Sales point</span><strong>{selected.salesPoint === 'WAREHOUSE_COUNTER' ? 'Warehouse counter (WH-)' : 'Market stall (MK-)'}</strong></div><div className="row"><span className="muted">Payment plan</span><strong>{selected.paymentPlan === 'COD' ? 'Cash on delivery' : selected.paymentPlan === 'PREPAID' ? `Prepaid${selected.prepaidMode ? ` · ${selected.prepaidMode}` : ''}` : 'UPI on delivery'}</strong></div>{selected.sale && <div className="row"><span className="muted">Bill number</span><strong>{selected.sale.number}</strong></div>}</section>
            <section style={{ marginBottom: 22 }}><h3 style={{ fontSize: 14, margin: '0 0 10px' }}>Items ({selected.lines.length})</h3>{selected.lines.map((line) => <div key={line.id} style={{ padding: '10px 0', borderBottom: '1px solid var(--border-light)' }}><div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}><strong>{line.item.name}{line.item.size ? ` · ${line.item.size}` : ''}</strong><strong>{formatPaise(line.mrpPaise * Number(line.qty))}</strong></div><div className="muted" style={{ fontSize: 12, marginTop: 4 }}>Qty {Number(line.qty)} × {formatPaise(line.mrpPaise)}</div>{line.batches?.length ? <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>Batches: {line.batches.map((b) => b.batch.code).join(', ')}</div> : null}</div>)}</section>
            <section style={{ marginBottom: 22 }}><h3 style={{ fontSize: 14, margin: '0 0 10px' }}>Amount summary</h3><div className="row"><span className="muted">Gross</span><span>{formatPaise(selected.grossPaise)}</span></div><div className="row"><span className="muted">Discount</span><span>− {formatPaise(selected.discountPaise)}</span></div><div className="row"><span className="muted">Tax</span><span>{formatPaise(selected.taxPaise)}</span></div><div className="row"><span className="muted">Delivery</span><span>{formatPaise(selected.deliveryChargePaise)}</span></div><div className="row" style={{ borderTop: '1px solid var(--border)', marginTop: 8, paddingTop: 10, fontWeight: 700 }}><span>Total</span><span>{formatPaise(selected.totalPaise)}</span></div></section>
            {selected.status === 'CANCELLED' && selected.cancelReason && <div className="error-banner">Cancellation reason: {selected.cancelReason}</div>}
            {selected.status === 'DISPATCHED' && <div className="muted" style={{ fontSize: 13 }}>Delivery staff: {selected.deliveryStaffName || 'Not assigned'}</div>}
            {selected.status === 'DELIVERED' && <div className="card" style={{ padding: 12, marginBottom: 12 }}><strong>Collection: {selected.collectedMode || 'Not recorded'}</strong><div className="muted" style={{ fontSize: 12, marginTop: 4 }}>{selected.collectedAmountPaise ? formatPaise(selected.collectedAmountPaise) : ''}</div>{selected.collectedMode === 'CASH' && <div className="muted" style={{ fontSize: 12 }}>{selected.cashHandedOverAt ? 'Cash handed over to office' : 'Cash pending office reconciliation'}</div>}</div>}
          </div>
          <footer style={{ padding: 16, borderTop: '1px solid var(--border)', display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'flex-end' }}>
            {selected.status === 'NEW' && <><button className="btn p" disabled={busyId === selected.id} onClick={() => void act(selected.id, 'pack')}>{busyId === selected.id ? 'Working…' : 'Pack order'}</button><button className="btn" disabled={busyId === selected.id} onClick={() => void cancel(selected)}>Cancel order</button></>}
            {selected.status === 'PACKED' && <><button className="btn p" disabled={busyId === selected.id} onClick={() => void dispatch(selected)}>Dispatch & create bill</button><button className="btn" disabled={busyId === selected.id} onClick={() => void cancel(selected)}>Cancel order</button></>}
            {selected.status === 'DISPATCHED' && <><Link to={`/orders/${selected.id}/deliver`} className="btn p" style={{ display: 'inline-flex', alignItems: 'center' }}>Record delivery</Link><button className="btn" disabled={busyId === selected.id} onClick={() => void cancel(selected)}>Mark delivery failed</button></>}
            {selected.status === 'DELIVERED' && selected.collectedMode === 'CASH' && !selected.cashHandedOverAt && <button className="btn p" disabled={busyId === selected.id} onClick={() => void act(selected.id, 'mark-cash-received')}>Mark cash received</button>}
            {selected.status === 'DELIVERED' && <button className="btn" onClick={() => setSelected(null)}>Close</button>}
          </footer>
        </aside>
      </div>}
    </>
  );
}
