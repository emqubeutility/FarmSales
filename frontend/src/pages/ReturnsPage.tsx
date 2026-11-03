import { useEffect, useState } from 'react';
import { api, ApiError } from '../lib/api.js';
import { formatPaise, formatDate } from '../lib/format.js';
import { SortTh, useTableSort } from '../lib/table-sort.js';

interface SaleLineBatchRow { id: string; batchId: string; qty: string; batch: { code: string } }
interface SaleLineRow { id: string; itemId: string; mrpPaise: number; item: { name: string; size: string | null }; batches: SaleLineBatchRow[] }
interface SaleRow { id: string; number: string | null; status: string; channel: string; createdAt: string; lines: SaleLineRow[] }
interface Customer { id: string; name: string; type: string }
interface CreditNoteRow { id: string; number: string; balancePaise: number; customer: { name: string } | null; issuedAt: string }

interface LineDraft { qty: string; restock: boolean }

export function ReturnsPage() {
  const [billNumber, setBillNumber] = useState('');
  const [sale, setSale] = useState<SaleRow | null>(null);
  const [lineDrafts, setLineDrafts] = useState<Record<string, LineDraft>>({});
  const [disposition, setDisposition] = useState<'REFUND' | 'CREDIT_NOTE'>('REFUND');
  const [refundMode, setRefundMode] = useState<'CASH' | 'UPI'>('CASH');
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customerId, setCustomerId] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ totalPaise: number; creditNote: { number: string; balancePaise: number } | null } | null>(null);
  const [busy, setBusy] = useState(false);

  const [creditNotes, setCreditNotes] = useState<CreditNoteRow[]>([]);
  const [lookupNumber, setLookupNumber] = useState('');
  const [lookupResult, setLookupResult] = useState<CreditNoteRow | 'not-found' | null>(null);

  const returnRows = sale ? sale.lines.flatMap((line) => line.batches.map((b) => ({ line, b }))) : [];
  const sortableReturnRows = useTableSort(returnRows, {
    item: (r) => r.line.item.name,
    sold: (r) => Number(r.b.qty),
    returnQty: (r) => Number(lineDrafts[r.b.id]?.qty ?? 0),
    restock: (r) => ((lineDrafts[r.b.id]?.restock ?? true) ? 'Restock' : 'Write off'),
  });

  useEffect(() => {
    api.get<Customer[]>('/customers').then(setCustomers);
    api.get<CreditNoteRow[]>('/credit-notes').then(setCreditNotes);
  }, []);

  async function findBill(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setResult(null);
    try {
      const sales = await api.get<SaleRow[]>('/sales');
      const found = sales.find((s) => s.number === billNumber.trim());
      if (!found) { setError(`No bill found with number "${billNumber.trim()}"`); setSale(null); return; }
      if (found.status !== 'FINALIZED') { setError(`Bill ${found.number} is ${found.status.toLowerCase()} — only a finalized bill can be returned against`); setSale(null); return; }
      setSale(found);
      setLineDrafts(Object.fromEntries(found.lines.flatMap((l) => l.batches).map((b) => [b.id, { qty: '0', restock: true }])));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not look up bill');
    }
  }

  function updateDraft(saleLineBatchId: string, patch: Partial<LineDraft>) {
    setLineDrafts((prev) => ({ ...prev, [saleLineBatchId]: { ...prev[saleLineBatchId], ...patch } }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!sale) return;
    setError(null);
    setBusy(true);
    const lines = Object.entries(lineDrafts)
      .filter(([, d]) => Number(d.qty) > 0)
      .map(([saleLineBatchId, d]) => ({ saleLineBatchId, qty: Number(d.qty), restock: d.restock }));
    if (lines.length === 0) {
      setError('Enter a return quantity for at least one line');
      setBusy(false);
      return;
    }
    try {
      const ret = await api.post<{ totalPaise: number; creditNote: { number: string; balancePaise: number } | null }>('/returns', {
        saleId: sale.id,
        disposition,
        refundMode: disposition === 'REFUND' ? refundMode : undefined,
        customerId: disposition === 'CREDIT_NOTE' ? customerId || undefined : undefined,
        reason: reason || undefined,
        lines,
      });
      setResult(ret);
      setSale(null);
      setBillNumber('');
      api.get<CreditNoteRow[]>('/credit-notes').then(setCreditNotes);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not process return');
    } finally {
      setBusy(false);
    }
  }

  async function lookupCreditNote(e: React.FormEvent) {
    e.preventDefault();
    try {
      const note = await api.get<CreditNoteRow>(`/credit-notes/by-number/${encodeURIComponent(lookupNumber.trim())}`);
      setLookupResult(note);
    } catch {
      setLookupResult('not-found');
    }
  }

  return (
    <>
      <div className="top">
        <h1>Returns and credit notes</h1>
      </div>
      <div className="body">
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 16 }}>
          {error && <div className="error-banner">{error}</div>}
          {result && (
            <div className="card" style={{ padding: 16, background: 'var(--accent-bg)' }}>
              <b>Return processed.</b> Value: {formatPaise(result.totalPaise)}
              {result.creditNote && <> · Credit note <b>{result.creditNote.number}</b> issued, balance {formatPaise(result.creditNote.balancePaise)}</>}
            </div>
          )}

          <form onSubmit={findBill} className="card" style={{ padding: '14px 16px', display: 'flex', gap: 12, alignItems: 'center' }}>
            <label className="muted" htmlFor="bill" style={{ fontSize: 14 }}>Original bill</label>
            <input id="bill" className="in" style={{ width: 200 }} value={billNumber} onChange={(e) => setBillNumber(e.target.value)} placeholder="MK-000118" required />
            <button type="submit" className="btn">Find</button>
            {sale && <span className="pill g">Found · {sale.channel} · {formatDate(sale.createdAt)}</span>}
          </form>

          {sale && (
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div className="card" style={{ overflow: 'hidden' }}>
                <table className="tbl">
                  <thead>
                    <tr>
                      <SortTh label="Item / batch" sortKey="item" sort={sortableReturnRows.sort} onSort={sortableReturnRows.toggle} />
                      <SortTh label="Sold" sortKey="sold" align="r" sort={sortableReturnRows.sort} onSort={sortableReturnRows.toggle} />
                      <SortTh label="Return qty" sortKey="returnQty" align="r" sort={sortableReturnRows.sort} onSort={sortableReturnRows.toggle} />
                      <SortTh label="Restock?" sortKey="restock" sort={sortableReturnRows.sort} onSort={sortableReturnRows.toggle} />
                    </tr>
                  </thead>
                  <tbody>
                    {sortableReturnRows.rows.map(({ line, b }) => (
                      <tr key={b.id}>
                        <td><b>{line.item.name}{line.item.size ? ` ${line.item.size}` : ''}</b><div className="muted" style={{ fontSize: 12.5 }}>Batch {b.batch.code} · {formatPaise(line.mrpPaise)}</div></td>
                        <td className="r">{b.qty}</td>
                        <td className="r">
                          <input className="in" style={{ width: 70, textAlign: 'right' }} type="number" step="0.001" min="0"
                            value={lineDrafts[b.id]?.qty ?? '0'} onChange={(e) => updateDraft(b.id, { qty: e.target.value })} />
                        </td>
                        <td>
                          <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <input type="checkbox" checked={lineDrafts[b.id]?.restock ?? true} onChange={(e) => updateDraft(b.id, { restock: e.target.checked })} />
                            <span className="muted" style={{ fontSize: 12.5 }}>{lineDrafts[b.id]?.restock ? 'Restock' : 'Write off'}</span>
                          </label>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="card" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ fontWeight: 700 }}>Resolution</div>
                <div style={{ display: 'flex', gap: 10 }}>
                  <label className={`pill ${disposition === 'REFUND' ? 'g' : 'n'}`} style={{ cursor: 'pointer', padding: '8px 16px' }}>
                    <input type="radio" name="disposition" checked={disposition === 'REFUND'} onChange={() => setDisposition('REFUND')} style={{ marginRight: 6 }} />
                    Refund
                  </label>
                  <label className={`pill ${disposition === 'CREDIT_NOTE' ? 'g' : 'n'}`} style={{ cursor: 'pointer', padding: '8px 16px' }}>
                    <input type="radio" name="disposition" checked={disposition === 'CREDIT_NOTE'} onChange={() => setDisposition('CREDIT_NOTE')} style={{ marginRight: 6 }} />
                    Credit note (no expiry — redeem on any later bill)
                  </label>
                </div>
                {disposition === 'REFUND' && (
                  <div>
                    <label className="lbl" htmlFor="refundMode">Refund mode</label>
                    <select id="refundMode" className="in" style={{ width: 160 }} value={refundMode} onChange={(e) => setRefundMode(e.target.value as 'CASH' | 'UPI')}>
                      <option value="CASH">Cash</option>
                      <option value="UPI">UPI (sent back manually)</option>
                    </select>
                  </div>
                )}
                {disposition === 'CREDIT_NOTE' && (
                  <div>
                    <label className="lbl" htmlFor="customer">Customer (optional)</label>
                    <select id="customer" className="in" style={{ width: 240 }} value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
                      <option value="">— none (anyone with the note can redeem) —</option>
                      {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                )}
                <div>
                  <label className="lbl" htmlFor="reason">Reason</label>
                  <input id="reason" className="in" style={{ width: 280 }} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Damaged, quality complaint, wrong item…" />
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button type="submit" className="btn p" style={{ minHeight: 48 }} disabled={busy}>
                  {busy ? 'Processing…' : disposition === 'REFUND' ? 'Issue refund' : 'Issue credit note'}
                </button>
              </div>
            </form>
          )}
        </div>

        <div className="card" style={{ width: 320, flex: 'none', padding: 18, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ fontWeight: 700 }}>Credit note register</div>
          <form onSubmit={lookupCreditNote} style={{ display: 'flex', gap: 6 }}>
            <input className="in" placeholder="CN-000001" value={lookupNumber} onChange={(e) => setLookupNumber(e.target.value)} />
            <button type="submit" className="btn">Look up</button>
          </form>
          {lookupResult === 'not-found' && <div className="muted" style={{ fontSize: 13 }}>Not found</div>}
          {lookupResult && lookupResult !== 'not-found' && (
            <div className="row"><span>{lookupResult.number}</span><span><b>{formatPaise(lookupResult.balancePaise)}</b></span></div>
          )}
          <div style={{ borderTop: '1px solid var(--border-light)', paddingTop: 10, display: 'flex', flexDirection: 'column', gap: 6, overflow: 'auto', flex: 1 }}>
            {creditNotes.map((n) => (
              <div key={n.id} className="row">
                <span>{n.number}{n.customer && <span className="muted"> · {n.customer.name}</span>}</span>
                <span>{formatPaise(n.balancePaise)}</span>
              </div>
            ))}
            {creditNotes.length === 0 && <div className="muted" style={{ fontSize: 13 }}>No credit notes issued yet</div>}
          </div>
        </div>
      </div>
    </>
  );
}
