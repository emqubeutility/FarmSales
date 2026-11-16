import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { splitCgstSgstFromTotal } from '@farm-sales/shared';
import { api, ApiError } from '../lib/api.js';
import { formatDate, formatPaise } from '../lib/format.js';
import { formatAddress } from '../lib/address.js';
import { SkeletonBlock } from '../components/Skeleton.js';

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
  deliveryLandmark: string | null;
  deliveryCity: string | null;
  deliveryState: string | null;
  deliveryPincode: string | null;
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
  showLogoOnBills: boolean;
  showGstinOnBills: boolean;
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

// Invoice styles. They apply to the screen and to the printed A4 page.
const invoiceStyles = `
  .inv-wrap { max-width: 794px; margin: 0 auto; }
  .inv-toolbar { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-bottom: 14px; }
  .inv { position: relative; background: #fff; color: #17261E; padding: 36px 40px; border: 1px solid #E3E8E1; border-radius: 14px; box-shadow: 0 1px 3px rgba(0,0,0,.06); font-size: 13.5px; }
  .inv-void { position: absolute; top: 36px; right: 40px; border: 2px solid #B42318; color: #B42318; font-weight: 800; letter-spacing: .08em; padding: 6px 12px; border-radius: 8px; transform: rotate(-6deg); }
  .inv-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 24px; padding-bottom: 20px; border-bottom: 2px solid #1F6B45; }
  .inv-brand { display: flex; gap: 14px; align-items: flex-start; min-width: 0; }
  .inv-logo { width: 56px; height: 56px; border-radius: 10px; object-fit: contain; flex: none; }
  .inv-name { font-size: 22px; font-weight: 800; color: #12301F; letter-spacing: -0.01em; }
  .inv-muted { color: #5B6B61; font-size: 12.5px; line-height: 1.5; }
  .inv-title { text-align: right; flex: none; }
  .inv-label { font-size: 12px; font-weight: 800; letter-spacing: .14em; text-transform: uppercase; color: #1F6B45; }
  .inv-number { font-size: 22px; font-weight: 800; margin-top: 2px; font-variant-numeric: tabular-nums; }
  .inv-meta { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; padding: 16px 0; border-bottom: 1px solid #E3E8E1; }
  .inv-meta span { display: block; font-size: 10.5px; font-weight: 700; text-transform: uppercase; letter-spacing: .08em; color: #6B7A70; }
  .inv-meta b { display: block; margin-top: 3px; font-size: 13.5px; font-weight: 600; }
  .inv-parties { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin: 18px 0; }
  .inv-box { background: #F6F8F5; border-radius: 10px; padding: 14px 16px; min-height: 110px; }
  .inv-kicker { font-size: 10.5px; font-weight: 800; text-transform: uppercase; letter-spacing: .08em; color: #1F6B45; margin-bottom: 6px; }
  .inv-customer { font-weight: 700; font-size: 14px; }
  .inv-table { width: 100%; border-collapse: collapse; font-variant-numeric: tabular-nums; }
  .inv-table th { text-align: left; font-size: 10.5px; font-weight: 800; text-transform: uppercase; letter-spacing: .06em; color: #5B6B61; padding: 9px 8px; border-bottom: 1px solid #B9C4BB; }
  .inv-table td { padding: 10px 8px; border-bottom: 1px solid #ECEFEA; vertical-align: top; }
  .inv-table tr { break-inside: avoid; }
  .inv-table .num { text-align: center; color: #6B7A70; width: 36px; }
  .inv-table .item { font-weight: 600; }
  .inv-table .r { text-align: right; white-space: nowrap; }
  .inv-foot { display: flex; justify-content: space-between; align-items: flex-start; gap: 24px; margin-top: 16px; }
  .inv-note { color: #5B6B61; font-size: 12.5px; padding-top: 6px; max-width: 320px; }
  .inv-totals { width: 310px; flex: none; }
  .inv-line { display: flex; justify-content: space-between; padding: 5px 0; color: #3E4F45; font-variant-numeric: tabular-nums; }
  .inv-grand { display: flex; justify-content: space-between; align-items: center; margin-top: 8px; padding: 12px 14px; border-radius: 10px; background: #1F6B45; color: #fff; font-size: 17px; font-weight: 800; font-variant-numeric: tabular-nums; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .inv-due { display: flex; justify-content: space-between; margin-top: 8px; padding: 8px 14px; border-radius: 8px; background: #FDECEA; color: #B42318; font-weight: 700; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .inv-thanks { text-align: center; color: #5B6B61; font-size: 12.5px; margin-top: 26px; padding-top: 14px; border-top: 1px solid #E3E8E1; }
  @media print {
    @page { size: A4; margin: 12mm; }
    body { background: #fff !important; }
    .no-print { display: none !important; }
    /* Print only the invoice, even when it is shown inside the Sales or Orders modal. */
    body * { visibility: hidden !important; }
    .inv, .inv * { visibility: visible !important; }
    .inv { position: absolute !important; left: 0 !important; top: 0 !important; width: 100% !important; border: 0 !important; box-shadow: none !important; border-radius: 0 !important; padding: 0 !important; }
    .inv-void { top: 0 !important; right: 0 !important; }
    .inv-box, .inv-table th { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }
`;

// The invoice itself. Shown on its own page (/bills/:id) and inside a modal on the Sales and Orders
// pages. With `onClose` (the modal), a Close button is shown in place of Back.
export function BillSheet({ saleId, onClose }: { saleId: string; onClose?: () => void }) {
  const [bill, setBill] = useState<Bill | null>(null);
  const [business, setBusiness] = useState<BusinessProfile | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.get<BusinessProfile>('/business-profile').then(setBusiness);
  }, []);

  useEffect(() => {
    if (!saleId) return;
    setError(null);
    setBill(null);
    api
      .get<Bill>(`/sales/${saleId}`)
      .then(setBill)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Could not load this invoice'));
  }, [saleId]);

  if (error) {
    return (
      <div className="inv-wrap">
        <div className="card" style={{ padding: 20 }}>
          <div className="error-banner">{error}</div>
          {onClose ? (
            <button type="button" className="btn" onClick={onClose} style={{ marginTop: 10 }}>Close</button>
          ) : (
            <Link to="/sales" className="btn" style={{ marginTop: 10, display: 'inline-flex' }}>&larr; Back to sales</Link>
          )}
        </div>
      </div>
    );
  }
  if (!bill) {
    return (
      <div className="inv-wrap">
        <div className="card" style={{ padding: 20 }}><SkeletonBlock height={420} /></div>
      </div>
    );
  }

  const { cgstPaise, sgstPaise } = splitCgstSgstFromTotal(bill.taxPaise ?? 0);
  const paidPaise = bill.payments.reduce((sum, p) => sum + p.amountPaise, 0);
  const balancePaise = (bill.totalPaise ?? 0) - paidPaise;
  const statusLabel = bill.status === 'FINALIZED' ? 'Issued' : bill.status === 'VOID' ? 'Void' : 'Held';
  const salesPointLabel = bill.salesPoint === 'MARKET_STALL' ? 'Market stall' : 'Warehouse counter';
  const address = bill.order ? formatAddress(bill.order) : '';

  return (
    <div className="inv-wrap">
      <style>{invoiceStyles}</style>

      <div className="inv-toolbar no-print">
        {onClose ? (
          <button type="button" className="btn" onClick={onClose}>Close</button>
        ) : (
          <Link to="/sales" className="btn">&larr; Back</Link>
        )}
        <button type="button" className="btn p" onClick={() => window.print()} style={{ minHeight: 44, padding: '0 22px' }}>
          Print invoice
        </button>
      </div>

      <article className="inv" aria-label={`Invoice ${bill.number ?? ''}`}>
        {bill.status === 'VOID' && <div className="inv-void">VOID</div>}

        <header className="inv-head">
          <div className="inv-brand">
            {business?.logoUrl && business.showLogoOnBills && <img className="inv-logo" src={business.logoUrl} alt="" />}
            <div>
              <div className="inv-name">{business?.name ?? 'Your business name'}</div>
              <div className="inv-muted">{business?.address ?? 'Address — set this in Settings'}</div>
              <div className="inv-muted">
                {business?.showGstinOnBills !== false && <>GSTIN {business?.gstin ?? 'not set'} &middot; </>}
                FSSAI {business?.fssaiNumber ?? 'not set'}
              </div>
            </div>
          </div>
          <div className="inv-title">
            <div className="inv-label">Invoice</div>
            <div className="inv-number">{bill.number ?? 'Not yet billed'}</div>
          </div>
        </header>

        <section className="inv-meta">
          <div><span>Date</span><b>{formatDate(bill.finalizedAt ?? bill.createdAt)}</b></div>
          <div><span>Sales point</span><b>{salesPointLabel}</b></div>
          <div><span>Channel</span><b>{bill.channel}</b></div>
          <div><span>Status</span><b>{statusLabel}</b></div>
        </section>

        <section className="inv-parties">
          <div className="inv-box">
            <div className="inv-kicker">Bill to</div>
            {bill.order ? (
              <>
                <div className="inv-customer">
                  {bill.order.customerName}
                  {bill.order.customerPhone && <span style={{ fontWeight: 500, color: '#5B6B61' }}> · {bill.order.customerPhone}</span>}
                </div>
                {address && <div className="inv-muted" style={{ marginTop: 3 }}>{address}</div>}
                {bill.order.zone && <div className="inv-muted">Delivery zone: {bill.order.zone.name}</div>}
              </>
            ) : (
              <div className="inv-muted">Counter sale. No customer on file.</div>
            )}
          </div>

          <div className="inv-box">
            <div className="inv-kicker">Payment</div>
            {bill.payments.length > 0 ? (
              bill.payments.map((p, i) => (
                <div key={i} className="inv-line" style={{ padding: '2px 0' }}>
                  <span>{p.mode}{p.reference ? ` (${p.reference})` : ''}</span>
                  <span>{formatPaise(p.amountPaise)}</span>
                </div>
              ))
            ) : (
              <>
                <div className="inv-muted">Collected on delivery. Not yet recorded.</div>
                {(business?.upiQrImageUrl || business?.upiId) && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 8 }}>
                    {business.upiQrImageUrl && <img src={business.upiQrImageUrl} alt="UPI QR code" style={{ width: 84, height: 84, objectFit: 'contain' }} />}
                    {business.upiId && <div className="inv-muted">Pay by UPI to<br /><b style={{ color: '#17261E' }}>{business.upiId}</b></div>}
                  </div>
                )}
              </>
            )}
          </div>
        </section>

        <table className="inv-table">
          <thead>
            <tr>
              <th className="num">#</th>
              <th>Item</th>
              <th className="r">Qty</th>
              <th className="r">Rate</th>
              <th className="r">GST</th>
              <th className="r">Amount</th>
            </tr>
          </thead>
          <tbody>
            {bill.lines.map((l, i) => (
              <tr key={l.id}>
                <td className="num">{i + 1}</td>
                <td>
                  <div className="item">{l.item.name}{l.item.size ? ` ${l.item.size}` : ''}</div>
                </td>
                <td className="r">{l.qty} {l.item.unit}</td>
                <td className="r">{formatPaise(l.mrpPaise)}</td>
                <td className="r">{l.taxRatePct}%</td>
                <td className="r">{formatPaise(Math.round(l.mrpPaise * Number(l.qty)))}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="inv-foot">
          <div className="inv-note">
            Prices include GST. Thank you for your order.
          </div>
          <div className="inv-totals">
            <div className="inv-line"><span>Gross</span><span>{formatPaise(bill.grossPaise)}</span></div>
            {!!bill.discountPaise && <div className="inv-line"><span>Discount</span><span>-{formatPaise(bill.discountPaise)}</span></div>}
            <div className="inv-line"><span>Taxable value</span><span>{formatPaise(bill.taxablePaise)}</span></div>
            <div className="inv-line"><span>CGST</span><span>{formatPaise(cgstPaise)}</span></div>
            <div className="inv-line"><span>SGST</span><span>{formatPaise(sgstPaise)}</span></div>
            {!!bill.deliveryChargePaise && <div className="inv-line"><span>Delivery</span><span>{formatPaise(bill.deliveryChargePaise)}</span></div>}
            {!!bill.roundOffPaise && <div className="inv-line"><span>Round off</span><span>{formatPaise(bill.roundOffPaise)}</span></div>}
            <div className="inv-grand"><span>Total</span><span>{formatPaise(bill.totalPaise)}</span></div>
            {bill.payments.length > 0 && balancePaise > 0 && (
              <div className="inv-due"><span>Balance due</span><span>{formatPaise(balancePaise)}</span></div>
            )}
          </div>
        </div>

        <div className="inv-thanks">Thank you for shopping with {business?.name ?? 'us'}.</div>
      </article>
    </div>
  );
}

export function BillPage() {
  const { id } = useParams<{ id: string }>();
  if (!id) return null;
  return (
    <div style={{ minHeight: '100vh', background: '#DDE3DB', padding: '24px 16px' }}>
      <BillSheet saleId={id} />
    </div>
  );
}
