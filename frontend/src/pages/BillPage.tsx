import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { splitCgstSgstFromTotal } from '@farm-sales/shared';
import { api, ApiError } from '../lib/api.js';
import { formatDate, formatPaise } from '../lib/format.js';

interface BillLine {
  id: string;
  qty: string;
  mrpPaise: number;
  taxRatePct: string;
  item: { name: string; size: string | null; unit: string };
}
interface BillPayment {
  mode: 'CASH' | 'UPI' | 'CREDIT_NOTE' | 'B2B_CREDIT';
  amountPaise: number;
  reference: string | null;
}
interface BillOrder {
  customerName: string;
  customerPhone: string | null;
  deliveryAddress: string | null;
  zone: { name: string } | null;
}
interface BusinessProfile {
  name: string;
  address: string | null;
  gstin: string | null;
  fssaiNumber: string | null;
  logoUrl: string | null;
  upiId: string | null;
  upiQrImageUrl: string | null;
}
interface Bill {
  id: string;
  number: string | null;
  status: 'HELD' | 'FINALIZED' | 'VOID';
  channel: string;
  salesPoint: string;
  createdAt: string;
  finalizedAt: string | null;
  grossPaise: number | null;
  discountPaise: number | null;
  taxablePaise: number | null;
  taxPaise: number | null;
  roundOffPaise: number | null;
  deliveryChargePaise: number | null;
  totalPaise: number | null;
  lines: BillLine[];
  payments: BillPayment[];
  order: BillOrder | null;
}

export function BillPage() {
  const { id } = useParams<{ id: string }>();
  const [bill, setBill] = useState<Bill | null>(null);
  const [business, setBusiness] = useState<BusinessProfile | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.get<BusinessProfile>('/business-profile').then(setBusiness);
  }, []);

  useEffect(() => {
    if (!id) return;
    setError(null);
    setBill(null);
    api
      .get<Bill>(`/sales/${id}`)
      .then(setBill)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Could not load this bill'));
  }, [id]);

  if (error) {
    return (
      <div style={{ padding: 20 }}>
        <div className="error-banner">{error}</div>
        <Link to="/sales" className="btn" style={{ marginTop: 10, display: 'inline-flex' }}>&larr; Back to sales</Link>
      </div>
    );
  }
  if (!bill) return <div style={{ padding: 20 }}>Loading…</div>;

  const { cgstPaise, sgstPaise } = splitCgstSgstFromTotal(bill.taxPaise ?? 0);
  const paidPaise = bill.payments.reduce((sum, p) => sum + p.amountPaise, 0);

  return (
    <div style={{ minHeight: '100vh', background: '#DDE3DB', padding: '24px 0' }}>
      <style>{`
        @media print {
          body { background: #fff !important; }
          .no-print { display: none !important; }
          .bill-sheet { box-shadow: none !important; margin: 0 !important; }
        }
      `}</style>
      <div className="bill-sheet card" style={{ width: 640, margin: '0 auto', padding: 32, background: '#fff' }}>
        <div className="no-print" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 18 }}>
          <Link to="/sales" className="btn">&larr; Back</Link>
          <button type="button" className="btn p" onClick={() => window.print()}>Print</button>
        </div>

        {bill.status === 'VOID' && (
          <div className="error-banner" style={{ textAlign: 'center', fontWeight: 700, marginBottom: 14 }}>VOIDED — not valid for payment</div>
        )}

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18 }}>
          <div style={{ display: 'flex', gap: 10 }}>
            {business?.logoUrl && <img src={business.logoUrl} alt="" style={{ width: 44, height: 44, borderRadius: 8, objectFit: 'cover' }} />}
            <div>
              <div style={{ fontSize: 20, fontWeight: 700 }}>{business?.name ?? '[YOUR BRAND]'}</div>
              <div className="muted" style={{ fontSize: 12.5 }}>{business?.address ?? '[Address — set this in Settings]'}</div>
              <div className="muted" style={{ fontSize: 12.5 }}>
                GSTIN: {business?.gstin ?? '[not set]'} &middot; FSSAI: {business?.fssaiNumber ?? '[not set]'}
              </div>
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 17, fontWeight: 700 }}>{bill.number ?? 'Not yet billed'}</div>
            <div className="muted" style={{ fontSize: 12.5 }}>{formatDate(bill.finalizedAt ?? bill.createdAt)}</div>
            <div className="muted" style={{ fontSize: 12.5 }}>{bill.salesPoint === 'MARKET_STALL' ? 'Market stall' : 'Warehouse counter'} &middot; {bill.channel}</div>
          </div>
        </div>

        <div style={{ borderTop: '1px solid var(--border-light)', borderBottom: '1px solid var(--border-light)', padding: '10px 0', marginBottom: 14 }}>
          <div className="lbl" style={{ marginBottom: 4 }}>Bill to</div>
          {bill.order ? (
            <>
              <div style={{ fontWeight: 600 }}>{bill.order.customerName}{bill.order.customerPhone && ` · ${bill.order.customerPhone}`}</div>
              {bill.order.deliveryAddress && <div className="muted" style={{ fontSize: 13.5 }}>{bill.order.deliveryAddress}</div>}
              {bill.order.zone && <div className="muted" style={{ fontSize: 13.5 }}>Delivery zone: {bill.order.zone.name}</div>}
            </>
          ) : (
            <div className="muted">Counter sale — no customer on file</div>
          )}
        </div>

        <table className="tbl" style={{ marginBottom: 14 }}>
          <thead>
            <tr>
              <th>Item</th>
              <th className="r">Qty</th>
              <th className="r">Rate</th>
              <th className="r">Tax %</th>
              <th className="r">Amount</th>
            </tr>
          </thead>
          <tbody>
            {bill.lines.map((l) => (
              <tr key={l.id}>
                <td>{l.item.name}{l.item.size ? ` ${l.item.size}` : ''}</td>
                <td className="r">{l.qty} {l.item.unit}</td>
                <td className="r">{formatPaise(l.mrpPaise)}</td>
                <td className="r">{l.taxRatePct}%</td>
                <td className="r">{formatPaise(l.mrpPaise * Number(l.qty))}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div style={{ marginLeft: 'auto', width: 260 }}>
          <div className="row"><span>Gross</span><span>{formatPaise(bill.grossPaise)}</span></div>
          {!!bill.discountPaise && <div className="row"><span>Discount</span><span>-{formatPaise(bill.discountPaise)}</span></div>}
          <div className="row"><span>Taxable value</span><span>{formatPaise(bill.taxablePaise)}</span></div>
          <div className="row"><span>CGST</span><span>{formatPaise(cgstPaise)}</span></div>
          <div className="row"><span>SGST</span><span>{formatPaise(sgstPaise)}</span></div>
          {!!bill.deliveryChargePaise && <div className="row"><span>Delivery</span><span>{formatPaise(bill.deliveryChargePaise)}</span></div>}
          {!!bill.roundOffPaise && <div className="row"><span>Round off</span><span>{formatPaise(bill.roundOffPaise)}</span></div>}
          <div className="row" style={{ borderTop: '1px solid var(--border-light)', marginTop: 6, paddingTop: 8, fontSize: 17, fontWeight: 700 }}>
            <span>Total</span><span>{formatPaise(bill.totalPaise)}</span>
          </div>
        </div>

        <div style={{ marginTop: 18, borderTop: '1px solid var(--border-light)', paddingTop: 12 }}>
          <div className="lbl" style={{ marginBottom: 4 }}>Payment</div>
          {bill.payments.length > 0 ? (
            bill.payments.map((p, i) => (
              <div key={i} className="row"><span>{p.mode}{p.reference ? ` (${p.reference})` : ''}</span><span>{formatPaise(p.amountPaise)}</span></div>
            ))
          ) : (
            <>
              <div className="muted" style={{ fontSize: 13.5 }}>Payment collected on delivery — not yet recorded.</div>
              {(business?.upiQrImageUrl || business?.upiId) && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 10 }}>
                  {business.upiQrImageUrl && <img src={business.upiQrImageUrl} alt="UPI QR" style={{ width: 100, height: 100, objectFit: 'contain' }} />}
                  {business.upiId && <div className="muted" style={{ fontSize: 13.5 }}>Or pay via UPI to: <b>{business.upiId}</b></div>}
                </div>
              )}
            </>
          )}
          {bill.payments.length > 0 && paidPaise < (bill.totalPaise ?? 0) && (
            <div className="muted" style={{ fontSize: 13.5, marginTop: 4 }}>Balance due: {formatPaise((bill.totalPaise ?? 0) - paidPaise)}</div>
          )}
        </div>

        <div className="muted" style={{ textAlign: 'center', fontSize: 12.5, marginTop: 24 }}>Thank you for your order.</div>
      </div>
    </div>
  );
}
