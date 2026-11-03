import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError } from '../lib/api.js';
import { formatPaise, formatDate } from '../lib/format.js';
import { SortTh, useTableSort } from '../lib/table-sort.js';

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

export function SalesPage() {
  const [sales, setSales] = useState<Sale[]>([]);
  const sortable = useTableSort(sales, saleSortValues);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editQtys, setEditQtys] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  function load() {
    api.get<Sale[]>('/sales').then(setSales);
  }
  useEffect(load, []);

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
                        <Link to={`/bills/${s.id}`} className="btn">View bill</Link>
                        <button type="button" className="btn" disabled={busyId === s.id} onClick={() => voidSale(s)}>Void</button>
                      </div>
                    )}
                    {s.status === 'VOID' && (
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        <Link to={`/bills/${s.id}`} className="btn">View bill</Link>
                        <span className="muted" style={{ fontSize: 12.5 }}>Voided</span>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
              {sales.length === 0 && (
                <tr><td colSpan={7} className="muted" style={{ padding: 20, textAlign: 'center' }}>No sales yet</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
