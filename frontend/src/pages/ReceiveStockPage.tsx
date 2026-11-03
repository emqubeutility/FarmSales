import { useEffect, useState } from 'react';
import { api, ApiError } from '../lib/api.js';
import { formatPaise, formatDate } from '../lib/format.js';
import { SortTh, useTableSort } from '../lib/table-sort.js';

interface Supplier { id: string; name: string }
interface Item { id: string; code: string; name: string; unit: string }

interface LineForm {
  itemId: string;
  qtyBase: string;
  ratePaise: string;
  taxRatePct: string;
  supplierLot: string;
  bestBefore: string;
}

interface ReceiptLine { id: string; itemId: string; qtyBase: string; ratePaise: number; amountPaise: number; item: { name: string } }
interface Receipt {
  id: string;
  supplierBillNo: string;
  billDate: string;
  status: 'ACTIVE' | 'VOID';
  supplier: { name: string };
  lines: ReceiptLine[];
}

const emptyLine: LineForm = { itemId: '', qtyBase: '', ratePaise: '', taxRatePct: '5', supplierLot: '', bestBefore: '' };

const receiptSortValues = {
  supplier: (r: Receipt) => r.supplier.name,
  billNo: (r: Receipt) => r.supplierBillNo,
  date: (r: Receipt) => new Date(r.billDate),
  lines: (r: Receipt) => r.lines.map((l) => `${l.item.name} x${l.qtyBase}`).join(', '),
  status: (r: Receipt) => r.status,
};

export function ReceiveStockPage() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const sortableReceipts = useTableSort(receipts, receiptSortValues);
  const [supplierId, setSupplierId] = useState('');
  const [supplierBillNo, setSupplierBillNo] = useState('');
  const [billDate, setBillDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [paymentMode, setPaymentMode] = useState<'CREDIT' | 'CASH' | 'UPI'>('CREDIT');
  const [lines, setLines] = useState<LineForm[]>([{ ...emptyLine }]);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ summary: { billTotalPaise: number } } | null>(null);
  const [saving, setSaving] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<Record<string, { qtyBase: string; ratePaise: string }>>({});
  const [rowError, setRowError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  function loadReceipts() {
    api.get<Receipt[]>('/goods-receipts').then(setReceipts);
  }

  useEffect(() => {
    api.get<Supplier[]>('/suppliers').then(setSuppliers);
    api.get<Item[]>('/items?active=true').then(setItems);
    loadReceipts();
  }, []);

  function updateLine(i: number, patch: Partial<LineForm>) {
    setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const receipt = await api.post<{ summary: { billTotalPaise: number } }>('/goods-receipts', {
        supplierId,
        supplierBillNo,
        billDate,
        paymentMode,
        lines: lines.map((l) => ({
          itemId: l.itemId,
          qtyBase: Number(l.qtyBase),
          ratePaise: Math.round(Number(l.ratePaise) * 100),
          taxRatePct: Number(l.taxRatePct),
          supplierLot: l.supplierLot || undefined,
          bestBefore: l.bestBefore || undefined,
        })),
      });
      setResult(receipt);
      setLines([{ ...emptyLine }]);
      setSupplierBillNo('');
      loadReceipts();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save receipt');
    } finally {
      setSaving(false);
    }
  }

  function startEdit(r: Receipt) {
    setEditingId(r.id);
    setRowError(null);
    setEditValues(Object.fromEntries(r.lines.map((l) => [l.id, { qtyBase: l.qtyBase, ratePaise: (l.ratePaise / 100).toFixed(2) }])));
  }

  async function saveEdit(r: Receipt) {
    setRowError(null);
    setBusyId(r.id);
    try {
      await api.patch(`/goods-receipts/${r.id}`, {
        lines: r.lines.map((l) => ({
          lineId: l.id,
          qtyBase: Number(editValues[l.id].qtyBase),
          ratePaise: Math.round(Number(editValues[l.id].ratePaise) * 100),
        })),
      });
      setEditingId(null);
      loadReceipts();
    } catch (err) {
      setRowError(err instanceof ApiError ? err.message : 'Could not save changes');
    } finally {
      setBusyId(null);
    }
  }

  async function voidReceipt(r: Receipt) {
    if (!confirm(`Void receipt ${r.supplierBillNo}? This reverses the stock it added and cannot be undone.`)) return;
    setRowError(null);
    setBusyId(r.id);
    try {
      await api.post(`/goods-receipts/${r.id}/void`);
      loadReceipts();
    } catch (err) {
      setRowError(err instanceof ApiError ? err.message : 'Could not void receipt — stock may have already moved');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <>
      <div className="top">
        <h1>Receive stock</h1>
      </div>
      <div className="body" style={{ flexDirection: 'column' }}>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {error && <div className="error-banner">{error}</div>}
          <div className="card" style={{ padding: 16, display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', gap: 12 }}>
            <div>
              <label className="lbl" htmlFor="supplier">Supplier</label>
              <select id="supplier" className="in" value={supplierId} onChange={(e) => setSupplierId(e.target.value)} required>
                <option value="">Select supplier</option>
                {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div>
              <label className="lbl" htmlFor="billNo">Supplier bill no.</label>
              <input id="billNo" className="in" value={supplierBillNo} onChange={(e) => setSupplierBillNo(e.target.value)} required />
            </div>
            <div>
              <label className="lbl" htmlFor="billDate">Bill date</label>
              <input id="billDate" className="in" type="date" value={billDate} onChange={(e) => setBillDate(e.target.value)} required />
            </div>
            <div>
              <label className="lbl" htmlFor="payment">Payment</label>
              <select id="payment" className="in" value={paymentMode} onChange={(e) => setPaymentMode(e.target.value as typeof paymentMode)}>
                <option value="CREDIT">On credit</option>
                <option value="CASH">Paid in cash</option>
                <option value="UPI">Paid by UPI</option>
              </select>
            </div>
          </div>

          <div className="card" style={{ padding: 16 }}>
            {lines.map((line, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr 1fr auto', gap: 10, marginBottom: 10, alignItems: 'end' }}>
                <div>
                  <label className="lbl">Item</label>
                  <select className="in" value={line.itemId} onChange={(e) => updateLine(i, { itemId: e.target.value })} required>
                    <option value="">Select item</option>
                    {items.map((it) => <option key={it.id} value={it.id}>{it.name} ({it.code})</option>)}
                  </select>
                </div>
                <div>
                  <label className="lbl">Qty</label>
                  <input className="in" type="number" step="0.001" value={line.qtyBase} onChange={(e) => updateLine(i, { qtyBase: e.target.value })} required />
                </div>
                <div>
                  <label className="lbl">Rate (₹, ex-GST)</label>
                  <input className="in" type="number" step="0.01" value={line.ratePaise} onChange={(e) => updateLine(i, { ratePaise: e.target.value })} required />
                </div>
                <div>
                  <label className="lbl">GST %</label>
                  <input className="in" type="number" step="0.01" value={line.taxRatePct} onChange={(e) => updateLine(i, { taxRatePct: e.target.value })} required />
                </div>
                <div>
                  <label className="lbl">Supplier lot</label>
                  <input className="in" value={line.supplierLot} onChange={(e) => updateLine(i, { supplierLot: e.target.value })} />
                </div>
                <div>
                  <label className="lbl">Best before</label>
                  <input className="in" type="date" value={line.bestBefore} onChange={(e) => updateLine(i, { bestBefore: e.target.value })} />
                </div>
                <button type="button" className="btn" onClick={() => setLines((prev) => prev.filter((_, idx) => idx !== i))} disabled={lines.length === 1}>
                  &times;
                </button>
              </div>
            ))}
            <button type="button" className="btn" onClick={() => setLines((prev) => [...prev, { ...emptyLine }])}>
              Add line
            </button>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
            {result && <div className="muted" style={{ alignSelf: 'center' }}>Last receipt total: {formatPaise(result.summary.billTotalPaise)}</div>}
            <button type="submit" className="btn p" style={{ minHeight: 48 }} disabled={saving}>
              {saving ? 'Saving…' : 'Save receipt and bill'}
            </button>
          </div>
        </form>

        <div className="card" style={{ overflow: 'hidden' }}>
          <div style={{ padding: '12px 16px', fontWeight: 700, borderBottom: '1px solid var(--border-light)' }}>Past receipts</div>
          {rowError && <div className="error-banner" style={{ margin: 12 }}>{rowError}</div>}
          <table className="tbl">
            <thead>
              <tr>
                <SortTh label="Supplier" sortKey="supplier" sort={sortableReceipts.sort} onSort={sortableReceipts.toggle} />
                <SortTh label="Bill no." sortKey="billNo" sort={sortableReceipts.sort} onSort={sortableReceipts.toggle} />
                <SortTh label="Date" sortKey="date" sort={sortableReceipts.sort} onSort={sortableReceipts.toggle} />
                <SortTh label="Lines" sortKey="lines" sort={sortableReceipts.sort} onSort={sortableReceipts.toggle} />
                <SortTh label="Status" sortKey="status" sort={sortableReceipts.sort} onSort={sortableReceipts.toggle} />
                <th></th>
              </tr>
            </thead>
            <tbody>
              {sortableReceipts.rows.map((r) => (
                <tr key={r.id}>
                  <td>{r.supplier.name}</td>
                  <td>{r.supplierBillNo}</td>
                  <td className="muted">{formatDate(r.billDate)}</td>
                  <td>
                    {editingId === r.id ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {r.lines.map((l) => (
                          <div key={l.id} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                            <span style={{ flex: 1 }}>{l.item.name}</span>
                            <input className="in" style={{ width: 70 }} type="number" step="0.001"
                              value={editValues[l.id]?.qtyBase ?? ''}
                              onChange={(e) => setEditValues((v) => ({ ...v, [l.id]: { ...v[l.id], qtyBase: e.target.value } }))} />
                            <input className="in" style={{ width: 80 }} type="number" step="0.01"
                              value={editValues[l.id]?.ratePaise ?? ''}
                              onChange={(e) => setEditValues((v) => ({ ...v, [l.id]: { ...v[l.id], ratePaise: e.target.value } }))} />
                          </div>
                        ))}
                      </div>
                    ) : (
                      r.lines.map((l) => `${l.item.name} x${l.qtyBase}`).join(', ')
                    )}
                  </td>
                  <td><span className={`pill ${r.status === 'ACTIVE' ? 'g' : 'rd'}`}>{r.status}</span></td>
                  <td>
                    {r.status === 'ACTIVE' && editingId !== r.id && (
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button type="button" className="btn" onClick={() => startEdit(r)}>Edit</button>
                        <button type="button" className="btn" disabled={busyId === r.id} onClick={() => voidReceipt(r)}>Void</button>
                      </div>
                    )}
                    {r.status === 'ACTIVE' && editingId === r.id && (
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button type="button" className="btn p" disabled={busyId === r.id} onClick={() => saveEdit(r)}>Save</button>
                        <button type="button" className="btn" onClick={() => setEditingId(null)}>Cancel</button>
                      </div>
                    )}
                    {r.status === 'VOID' && <span className="muted" style={{ fontSize: 12.5 }}>Voided</span>}
                  </td>
                </tr>
              ))}
              {receipts.length === 0 && (
                <tr><td colSpan={6} className="muted" style={{ padding: 20, textAlign: 'center' }}>No receipts yet</td></tr>
              )}
            </tbody>
          </table>
          <div className="muted" style={{ padding: '10px 16px', fontSize: 12.5 }}>
            Edit/void only work while nothing has consumed from this receipt's stock yet — once it has, you'll get an error suggesting a stock adjustment instead.
          </div>
        </div>
      </div>
    </>
  );
}
