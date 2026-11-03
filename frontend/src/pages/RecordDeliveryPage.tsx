import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api, ApiError } from '../lib/api.js';
import { formatPaise } from '../lib/format.js';

interface OrderLine { id: string; qty: string; item: { name: string; size: string | null } }
interface OrderDetail {
  id: string; code: string; customerName: string; customerPhone: string | null; deliveryAddress: string | null;
  zone: { name: string; feePaise: number } | null; deliveryChargePaise: number; totalPaise: number;
  lines: OrderLine[];
}

export function RecordDeliveryPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [mode, setMode] = useState<'CASH' | 'UPI' | 'ALREADY_PAID'>('CASH');
  const [amount, setAmount] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!id) return;
    api.get<OrderDetail>(`/orders/${id}`).then((o) => {
      setOrder(o);
      setAmount((o.totalPaise / 100).toFixed(2));
    });
  }, [id]);

  async function markDelivered() {
    if (!id) return;
    setError(null);
    setBusy(true);
    try {
      await api.post(`/orders/${id}/record-delivery`, {
        collectedMode: mode,
        collectedAmountPaise: mode === 'ALREADY_PAID' ? undefined : Math.round(Number(amount) * 100),
      });
      navigate('/orders');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not record delivery');
    } finally {
      setBusy(false);
    }
  }

  async function deliveryFailed() {
    if (!id) return;
    const reason = window.prompt('Reason delivery failed?', 'Not reachable') ?? undefined;
    if (reason === undefined) return;
    setError(null);
    setBusy(true);
    try {
      await api.post(`/orders/${id}/cancel`, { reason });
      navigate('/orders');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not record failure');
    } finally {
      setBusy(false);
    }
  }

  if (!order) return <div style={{ padding: 20 }}>Loading…</div>;

  return (
    <div style={{ minHeight: '100vh', background: '#DDE3DB', display: 'flex', justifyContent: 'center' }}>
      <div style={{ width: 390, minHeight: '100vh', background: 'var(--bg)', display: 'flex', flexDirection: 'column' }}>
        <div style={{ background: '#12301F', color: '#fff', padding: 16, fontSize: 17, fontWeight: 700 }}>Delivery · {order.code}</div>
        <div style={{ flex: 1, padding: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {error && <div className="error-banner">{error}</div>}
          <div className="card" style={{ padding: 14 }}>
            <div style={{ fontSize: 16, fontWeight: 700 }}>{order.customerName}{order.zone && ` · ${order.zone.name}`}</div>
            <div className="muted" style={{ fontSize: 13, marginTop: 2 }}>{order.deliveryAddress ?? 'No address on file'} · {order.customerPhone ?? '—'}</div>
          </div>
          <div className="card" style={{ padding: 14 }}>
            {order.lines.map((l) => (
              <div key={l.id} className="row"><span>{l.item.name}{l.item.size ? ` ${l.item.size}` : ''} &times; {l.qty}</span></div>
            ))}
            {order.zone && <div className="row"><span>Delivery ({order.zone.name})</span><span>{formatPaise(order.deliveryChargePaise)}</span></div>}
            <div className="row" style={{ borderTop: '1px solid var(--border-light)', marginTop: 6, paddingTop: 8, fontSize: 17, fontWeight: 700 }}>
              <span>Amount to collect</span><span>{formatPaise(order.totalPaise)}</span>
            </div>
          </div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>How was it paid?</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
              {(['CASH', 'UPI', 'ALREADY_PAID'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  className="btn"
                  style={{ minHeight: 52, background: mode === m ? '#1F6B45' : '#fff', borderColor: mode === m ? '#1F6B45' : undefined, color: mode === m ? '#fff' : undefined }}
                  onClick={() => setMode(m)}
                >
                  {m === 'CASH' ? 'Cash' : m === 'UPI' ? 'UPI' : 'Already paid'}
                </button>
              ))}
            </div>
          </div>
          {mode !== 'ALREADY_PAID' && (
            <div>
              <label className="lbl" htmlFor="amt">Amount collected (₹)</label>
              <input id="amt" className="in" style={{ height: 48, fontSize: 17 }} value={amount} onChange={(e) => setAmount(e.target.value)} />
            </div>
          )}
          <div className="muted" style={{ fontSize: 12.5, lineHeight: 1.4 }}>
            Cash stays "with delivery staff" until the office ticks it received on the Order desk.
          </div>
          <div style={{ flex: 1 }} />
          <button className="btn p" style={{ minHeight: 52, fontSize: 16 }} disabled={busy} onClick={markDelivered}>Mark delivered</button>
          <button className="btn" style={{ minHeight: 52, fontSize: 16 }} disabled={busy} onClick={deliveryFailed}>Delivery failed</button>
        </div>
      </div>
    </div>
  );
}
