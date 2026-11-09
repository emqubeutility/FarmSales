import { useEffect, useMemo, useState } from 'react';
import { api, ApiError } from '../lib/api.js';
import { formatPaise, formatDate } from '../lib/format.js';
import { SortTh, useTableSort } from '../lib/table-sort.js';
import { DEFAULT_SALE_FILTERS, filterSales, type SaleFilters } from '../lib/sale-filters.js';
import { SalesFilterBar } from '../components/SalesFilterBar.js';
import { BillSheet } from './BillPage.js';

interface SaleLine { id: string; itemId: string; qty: string; mrpPaise: number; item: { name: string } }
interface Sale {
  id: string;
  number: string | null;
  status: 'HELD' | 'FINALIZED' | 'VOID';
  salesPoint: string;
  channel: string;
  discountPct: string;
  totalPaise: number | null;
  createdAt: string;
  lines: SaleLine[];
}

const saleSortValues = {
  bill: (s: Sale) => s.number,
  channel: (s: Sale) => s.channel,
  lines: (s: Sale) => s.lines.map((l) => l.item.name).join(', '),
  date: (s: Sale) => new Date(s.createdAt),
  total: (s: Sale) => s.totalPaise,
  status: (s: Sale) => s.status,
};

// The API returns the newest bills first, capped at this many. Search and filters run on these.
const LOAD_LIMIT = 1000;

export function SalesPage() {
  const [sales, setSales] = useState<Sale[]>([]);
  const [filters, setFilters] = useState<SaleFilters>(DEFAULT_SALE_FILTERS);
  const visibleSales = useMemo(() => filterSales(sales, filters), [sales, filters]);
  const sortable = useTableSort(visibleSales, saleSortValues);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editQtys, setEditQtys] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  // The bill open in the modal, if any.
  const [viewingId, setViewingId] = useState<string | null>(null);

  function load() {
    api.get<Sale[]>(`/sales?limit=${LOAD_LIMIT}`).then(setSales);
  }
  useEffect(load, []);

  // Escape closes the bill modal.
  useEffect(() => {
    if (!viewingId) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setViewingId(null);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [viewingId]);

  function startEdit(sale: Sale) {
    setEditingId(sale.id);
    setEditQtys(Object.fromEntries(sale.lines.map((l) => [l.itemId, l.qty])));
    setError(null);
  }

  async function saveEdit(sale: Sale) {
    setError(null);
    setBusyId(sale.id);
    try {
      await api.patch(`/sales/${sale.id}`, {
        lines: sale.lines.map((l) => ({ itemId: l.itemId, qty: Number(editQtys[l.itemId]) })),
      });
      setEditingId(null);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save changes');
    } finally {
      setBusyId(null);
    }
  }

  async function deleteHeld(sale: Sale) {
    if (!confirm(`Delete this held bill (${sale.lines.length} line(s))? This cannot be undone.`)) return;
    setError(null);
    setBusyId(sale.id);
    try {
      await api.delete(`/sales/${sale.id}`);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not delete');
    } finally {
      setBusyId(null);
    }
  }

  async function voidSale(sale: Sale) {
    if (!confirm(`Void bill ${sale.number}? This reverses the stock it sold and cannot be undone. The bill number stays on record.`)) return;
    setError(null);
    setBusyId(sale.id);
    try {
      await api.post(`/sales/${sale.id}/void`);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not void sale');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <>
      <div className="top">
        <h1>Sales</h1>
      </div>
      <div className="body" style={{ flexDirection: 'column' }}>
        {error && <div className="error-banner">{error}</div>}
        <div className="card" style={{ overflow: 'hidden' }}>
          <SalesFilterBar filters={filters} onChange={setFilters} sales={sales} shown={visibleSales.length} total={sales.length} />
          <table className="tbl">
            <thead>
              <tr>
                <SortTh label="Bill" sortKey="bill" sort={sortable.sort} onSort={sortable.toggle} />
                <SortTh label="Channel" sortKey="channel" sort={sortable.sort} onSort={sortable.toggle} />
                <SortTh label="Lines" sortKey="lines" sort={sortable.sort} onSort={sortable.toggle} />
                <SortTh label="Date" sortKey="date" sort={sortable.sort} onSort={sortable.toggle} />
                <SortTh label="Total" sortKey="total" align="r" sort={sortable.sort} onSort={sortable.toggle} />
                <SortTh label="Status" sortKey="status" sort={sortable.sort} onSort={sortable.toggle} />
                <th></th>
              </tr>
            </thead>
            <tbody>
              {sortable.rows.map((s) => (
                <tr key={s.id}>
                  <td>{s.number ?? <span className="muted">—</span>}</td>
                  <td className="muted">{s.channel}</td>
                  <td>
                    {editingId === s.id ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {s.lines.map((l) => (
                          <div key={l.id} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                            <span style={{ flex: 1 }}>{l.item.name}</span>
                            <input
                              className="in"
                              style={{ width: 70 }}
                              type="number"
                              value={editQtys[l.itemId] ?? ''}
                              onChange={(e) => setEditQtys((q) => ({ ...q, [l.itemId]: e.target.value }))}
                            />
                          </div>
                        ))}
                      </div>
                    ) : (
                      s.lines.map((l) => `${l.item.name} x${l.qty}`).join(', ')
                    )}
                  </td>
                  <td className="muted">{formatDate(s.createdAt)}</td>
                  <td className="r">{formatPaise(s.totalPaise)}</td>
                  <td>
                    <span className={`pill ${s.status === 'FINALIZED' ? 'g' : s.status === 'VOID' ? 'rd' : 'a'}`}>{s.status}</span>
                  </td>
                  <td>
                    {s.status === 'HELD' && editingId !== s.id && (
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button type="button" className="btn" onClick={() => startEdit(s)}>Edit</button>
                        <button type="button" className="btn" disabled={busyId === s.id} onClick={() => deleteHeld(s)}>Delete</button>
                      </div>
                    )}
                    {s.status === 'HELD' && editingId === s.id && (
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button type="button" className="btn p" disabled={busyId === s.id} onClick={() => saveEdit(s)}>Save</button>
                        <button type="button" className="btn" onClick={() => setEditingId(null)}>Cancel</button>
                      </div>
                    )}
                    {s.status === 'FINALIZED' && (
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button type="button" className="btn" onClick={() => setViewingId(s.id)}>View bill</button>
                        <button type="button" className="btn" disabled={busyId === s.id} onClick={() => voidSale(s)}>Void</button>
                      </div>
                    )}
                    {s.status === 'VOID' && (
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        <button type="button" className="btn" onClick={() => setViewingId(s.id)}>View bill</button>
                        <span className="muted" style={{ fontSize: 12.5 }}>Voided</span>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
              {sales.length === 0 && (
                <tr><td colSpan={7} className="muted" style={{ padding: 20, textAlign: 'center' }}>No sales yet</td></tr>
              )}
              {sales.length > 0 && visibleSales.length === 0 && (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: 40 }}>
                    <div style={{ fontWeight: 600 }}>No bills match these filters</div>
                    <div className="muted" style={{ marginTop: 5 }}>Try a different search or date range.</div>
                    <button type="button" className="btn" style={{ marginTop: 14 }} onClick={() => setFilters(DEFAULT_SALE_FILTERS)}>
                      Reset filters
                    </button>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      {viewingId && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Bill"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setViewingId(null);
          }}
          style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(13, 29, 20, .45)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '24px 16px', overflowY: 'auto' }}
        >
          <BillSheet saleId={viewingId} onClose={() => setViewingId(null)} />
        </div>
      )}
    </>
  );
}
