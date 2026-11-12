import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, ApiError } from '../lib/api.js';
import { formatPaise } from '../lib/format.js';
import { useAuth } from '../lib/auth-context.js';

// The dashboard: today's numbers, a seven-day trend, what needs attention, and the latest sales.

type Range = 'today' | '7d' | '30d';

interface Kpi {
  value: number;
  changePct: number | null;
}

interface DashboardData {
  range: Range;
  canSeeProfit: boolean;
  kpis: {
    sales: Kpi;
    bills: Kpi;
    averageBill: Kpi;
    grossProfit: Kpi | null;
  };
  trend: { date: string; label: string; salesPaise: number; bills: number; profitPaise: number }[];
  topItems: { itemId: string; name: string; size: string | null; qty: number; amountPaise: number }[];
  recentSales: { id: string; number: string | null; createdAt: string; channel: string; totalPaise: number | null; paymentMode: string | null }[];
  attention: { lowStock: number; expiringBatches: number; pendingOrders: number; heldBills: number };
}

const rangeLabels: Record<Range, { label: string; vs: string }> = {
  today: { label: 'Today', vs: 'vs yesterday' },
  '7d': { label: 'Last 7 days', vs: 'vs previous 7 days' },
  '30d': { label: 'Last 30 days', vs: 'vs previous 30 days' },
};

const green = '#1F6B45';
const ink = '#12301F';
const red = '#B42318';

// A short rupee amount for axis labels: 25,000 -> ₹25k.
function short(paise: number): string {
  const rupees = paise / 100;
  if (rupees >= 100000) return `₹${(rupees / 100000).toFixed(1)}L`;
  if (rupees >= 1000) return `₹${Math.round(rupees / 1000)}k`;
  return `₹${Math.round(rupees)}`;
}

function timeOf(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' });
}

// The little icon in the corner of each card.
function Glyph({ children }: { children: ReactNode }) {
  return (
    <span style={{ width: 40, height: 40, borderRadius: 12, background: '#E8F3EC', color: green, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {children}
      </svg>
    </span>
  );
}

// A small line drawn from the last seven values.
function Sparkline({ values }: { values: number[] }) {
  const w = 110;
  const h = 40;
  const max = Math.max(1, ...values);
  const min = Math.min(0, ...values);
  const span = max - min || 1;
  const pts = values.map((v, i) => [(i / Math.max(1, values.length - 1)) * w, h - ((v - min) / span) * (h - 6) - 3] as const);
  const line = pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const area = `${line} L${w},${h} L0,${h} Z`;
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true" style={{ flex: 'none' }}>
      <path d={area} fill="#DDF0E3" />
      <path d={line} fill="none" stroke={green} strokeWidth="2" strokeLinejoin="round" />
    </svg>
  );
}

// The sales trend: a filled line over seven days, with rupee ticks on the left.
function TrendChart({ points }: { points: { label: string; value: number }[] }) {
  const W = 760;
  const H = 280;
  const padL = 56;
  const padR = 16;
  const padT = 24;
  const padB = 32;
  const max = Math.max(1, ...points.map((p) => p.value));
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;
  const x = (i: number) => padL + (points.length === 1 ? innerW / 2 : (i / (points.length - 1)) * innerW);
  const y = (v: number) => padT + innerH - (v / max) * innerH;
  const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ');
  const area = `${line} L${x(points.length - 1).toFixed(1)},${padT + innerH} L${x(0).toFixed(1)},${padT + innerH} Z`;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => max * t);
  const last = points.length - 1;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Sales for the last seven days" style={{ display: 'block' }}>
      <defs>
        <linearGradient id="trendFill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#1F6B45" stopOpacity="0.22" />
          <stop offset="100%" stopColor="#1F6B45" stopOpacity="0.02" />
        </linearGradient>
      </defs>
      {ticks.map((t) => (
        <g key={t}>
          <line x1={padL} x2={W - padR} y1={y(t)} y2={y(t)} stroke="#E6EBE4" />
          <text x={padL - 10} y={y(t) + 4} textAnchor="end" fontSize="12" fill="#5B6B61">{short(t)}</text>
        </g>
      ))}
      <path d={area} fill="url(#trendFill)" />
      <path d={line} fill="none" stroke={green} strokeWidth="2.5" strokeLinejoin="round" />
      {points.map((p, i) => (
        <g key={i}>
          <circle cx={x(i)} cy={y(p.value)} r={i === last ? 5 : 3.5} fill="#fff" stroke={green} strokeWidth="2" />
          <text x={x(i)} y={H - 8} textAnchor="middle" fontSize="12" fill="#5B6B61">{p.label}</text>
        </g>
      ))}
      <g>
        <rect x={Math.min(x(last) - 58, W - padR - 116)} y={y(points[last].value) - 40} width="116" height="26" rx="8" fill={ink} />
        <text x={Math.min(x(last), W - padR - 58)} y={y(points[last].value) - 23} textAnchor="middle" fontSize="13" fontWeight="700" fill="#fff">{formatPaise(points[last].value)}</text>
      </g>
    </svg>
  );
}

function ChangeLine({ change, vs }: { change: number | null; vs: string }) {
  if (change === null) return <div className="muted" style={{ fontSize: 12.5, marginTop: 6 }}>No earlier data to compare</div>;
  const up = change >= 0;
  return (
    <div style={{ fontSize: 12.5, color: up ? green : red, fontWeight: 600, whiteSpace: 'nowrap' }}>
      {up ? '▲' : '▼'} {up ? '+' : ''}{change}% <span className="muted" style={{ fontWeight: 500 }}>{vs}</span>
    </div>
  );
}

function Panel({ title, action, children, style }: { title: string; action?: ReactNode; children: ReactNode; style?: React.CSSProperties }) {
  return (
    <section className="card" style={{ padding: 18, display: 'flex', flexDirection: 'column', minWidth: 0, ...style }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, flex: 1 }}>{title}</h2>
        {action}
      </header>
      {children}
    </section>
  );
}

export function DashboardPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [range, setRange] = useState<Range>('today');
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    api
      .get<DashboardData>(`/dashboard?range=${range}`)
      .then((d) => {
        setData(d);
        setError(null);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Could not load the dashboard'))
      .finally(() => setLoading(false));
  }, [range]);

  useEffect(() => {
    load();
  }, [load]);

  const initials = (user?.name ?? '?').split(' ').filter(Boolean).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
  const trend = data?.trend ?? [];
  const kpiCards = useMemo(() => {
    if (!data) return [];
    const cards: { key: string; title: string; value: string; kpi: Kpi; spark: number[]; icon: ReactNode }[] = [
      {
        key: 'sales',
        title: 'Sales',
        value: formatPaise(data.kpis.sales.value),
        kpi: data.kpis.sales,
        spark: trend.map((t) => t.salesPaise),
        icon: <path d="M4 7c0-1.7 3.6-3 8-3s8 1.3 8 3-3.6 3-8 3-8-1.3-8-3zM4 7v10c0 1.7 3.6 3 8 3s8-1.3 8-3V7M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3" />,
      },
      {
        key: 'bills',
        title: 'Bills',
        value: String(data.kpis.bills.value),
        kpi: data.kpis.bills,
        spark: trend.map((t) => t.bills),
        icon: <path d="M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6M9 16h4" />,
      },
      {
        key: 'average',
        title: 'Average Bill',
        value: formatPaise(data.kpis.averageBill.value),
        kpi: data.kpis.averageBill,
        spark: trend.map((t) => (t.bills ? t.salesPaise / t.bills : 0)),
        icon: <path d="M3 4h2l2.4 11.2a1 1 0 0 0 1 .8h9.2a1 1 0 0 0 1-.8L20 8H7" />,
      },
    ];
    if (data.kpis.grossProfit) {
      cards.push({
        key: 'profit',
        title: 'Gross Profit',
        value: formatPaise(data.kpis.grossProfit.value),
        kpi: data.kpis.grossProfit,
        spark: trend.map((t) => t.profitPaise),
        icon: <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />,
      });
    }
    return cards;
  }, [data, trend]);

  return (
    <>
      <div className="top" style={{ gap: 12, height: 'auto', minHeight: 64, padding: '12px 24px', flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ margin: 0 }}>Dashboard</h1>
          <div className="muted" style={{ fontSize: 13, marginTop: 2 }}>Business overview</div>
        </div>
        <div style={{ flex: 1 }} />
        <button type="button" className="btn" style={{ minHeight: 42, display: 'inline-flex', alignItems: 'center', gap: 10, padding: '0 16px' }} onClick={() => navigate('/pos')}>
          Held Bills
          <span className="pill g">{data?.attention.heldBills ?? 0}</span>
        </button>
        <span aria-label={`Signed in as ${user?.name ?? 'user'}`} title={user?.name} style={{ width: 42, height: 42, borderRadius: '50%', background: '#145B2B', color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}>
          {initials}
        </span>
      </div>

      <div className="body" style={{ flexDirection: 'column', gap: 16, padding: '18px 24px 24px' }}>
        {error && <div className="error-banner">{error}</div>}

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <select className="in" aria-label="Date range" value={range} onChange={(e) => setRange(e.target.value as Range)} style={{ width: 190, height: 42, borderRadius: 12, fontWeight: 600 }}>
            <option value="today">Today</option>
            <option value="7d">Last 7 days</option>
            <option value="30d">Last 30 days</option>
          </select>
          <button type="button" className="btn" aria-label="Refresh" onClick={load} disabled={loading} style={{ minHeight: 42, width: 42, padding: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 12a9 9 0 1 1-3-6.7M21 3v6h-6" /></svg>
          </button>
          <div style={{ flex: 1 }} />
          <button type="button" className="btn p" style={{ minHeight: 42, borderRadius: 12, padding: '0 18px' }} onClick={() => navigate('/pos')}>+ New Sale</button>
          <button type="button" className="btn" style={{ minHeight: 42, borderRadius: 12, padding: '0 16px' }} onClick={() => navigate('/receive-stock')}>Receive Stock</button>
          <button type="button" className="btn" style={{ minHeight: 42, borderRadius: 12, padding: '0 16px' }} onClick={() => navigate('/orders')}>View Fulfilments</button>
        </div>

        {!data ? (
          <div className="muted" style={{ padding: 40, textAlign: 'center' }}>Loading the dashboard…</div>
        ) : (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14 }}>
              {kpiCards.map((c) => (
                <div key={c.key} className="card" style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <Glyph>{c.icon}</Glyph>
                    <div className="muted" style={{ fontSize: 14, fontWeight: 600, flex: 1, minWidth: 0 }}>{c.title}</div>
                    <Sparkline values={c.spark} />
                  </div>
                  <div style={{ fontSize: 26, fontWeight: 800, color: ink, whiteSpace: 'nowrap' }}>{c.value}</div>
                  <ChangeLine change={c.kpi.changePct} vs={rangeLabels[range].vs} />
                </div>
              ))}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 1fr)', gap: 14 }}>
              <Panel title="Sales Trend" action={<span className="muted" style={{ fontSize: 13 }}>Last 7 days</span>}>
                <TrendChart points={trend.map((t) => ({ label: t.label, value: t.salesPaise }))} />
              </Panel>

              <Panel title="Needs Attention">
                {[
                  { title: 'Low Stock', text: `${data.attention.lowStock} item${data.attention.lowStock === 1 ? ' is' : 's are'} at or below the reorder level`, to: '/inventory', tone: 'amber' },
                  { title: 'Batches Expiring Soon', text: `${data.attention.expiringBatches} batch${data.attention.expiringBatches === 1 ? ' is' : 'es are'} expiring within 8 days`, to: '/batches', tone: 'amber' },
                  { title: 'Fulfilments Pending', text: `${data.attention.pendingOrders} order${data.attention.pendingOrders === 1 ? ' is' : 's are'} waiting to be packed or dispatched`, to: '/orders', tone: 'amber' },
                ].map((row) => (
                  <button
                    key={row.title}
                    type="button"
                    onClick={() => navigate(row.to)}
                    style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 4px', border: 0, borderBottom: '1px solid #EEF1EC', background: 'transparent', textAlign: 'left', cursor: 'pointer', width: '100%' }}
                  >
                    <span style={{ width: 36, height: 36, borderRadius: 999, border: '2px solid #D9A400', color: '#B57E00', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, flex: 'none' }} aria-hidden="true">!</span>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: 'block', fontWeight: 700, fontSize: 14.5 }}>{row.title}</span>
                      <span className="muted" style={{ display: 'block', fontSize: 12.5, marginTop: 2 }}>{row.text}</span>
                    </span>
                    <span aria-hidden="true" style={{ color: '#5C6E63', fontSize: 18 }}>›</span>
                  </button>
                ))}
              </Panel>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1.25fr)', gap: 14 }}>
              <Panel title="Top-selling Items" action={<button type="button" className="btn" style={{ minHeight: 34, border: 0, color: green, fontWeight: 700, background: 'transparent' }} onClick={() => navigate('/inventory')}>View All →</button>}>
                <div style={{ overflowX: 'auto' }}>
                  <table className="tbl">
                    <thead><tr><th>#</th><th>Item</th><th className="r">Qty Sold</th><th className="r">Sales Amount</th></tr></thead>
                    <tbody>
                      {data.topItems.map((item, i) => (
                        <tr key={item.itemId}>
                          <td>{i + 1}</td>
                          <td><strong>{item.name}</strong>{item.size ? <span className="muted" style={{ fontSize: 12.5 }}> · {item.size}</span> : null}</td>
                          <td className="r">{item.qty}</td>
                          <td className="r">{formatPaise(item.amountPaise)}</td>
                        </tr>
                      ))}
                      {data.topItems.length === 0 && <tr><td colSpan={4} className="muted" style={{ textAlign: 'center', padding: 24 }}>No sales in this period</td></tr>}
                    </tbody>
                  </table>
                </div>
              </Panel>

              <Panel title="Recent Sales" action={<button type="button" className="btn" style={{ minHeight: 34, border: 0, color: green, fontWeight: 700, background: 'transparent' }} onClick={() => navigate('/sales')}>View All →</button>}>
                <div style={{ overflowX: 'auto' }}>
                  <table className="tbl">
                    <thead><tr><th>Bill No.</th><th>Time</th><th className="r">Amount</th><th>Payment</th><th>Status</th></tr></thead>
                    <tbody>
                      {data.recentSales.map((s) => (
                        <tr key={s.id}>
                          <td><strong>{s.number ?? '—'}</strong></td>
                          <td className="muted">{timeOf(s.createdAt)}</td>
                          <td className="r">{formatPaise(s.totalPaise)}</td>
                          <td>{s.paymentMode ? <span className="pill n">{s.paymentMode}</span> : <span className="muted">—</span>}</td>
                          <td><span className="pill g">Paid</span></td>
                        </tr>
                      ))}
                      {data.recentSales.length === 0 && <tr><td colSpan={5} className="muted" style={{ textAlign: 'center', padding: 24 }}>No sales yet</td></tr>}
                    </tbody>
                  </table>
                </div>
              </Panel>
            </div>
          </>
        )}
      </div>
    </>
  );
}
