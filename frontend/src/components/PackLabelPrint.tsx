import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { api } from '../lib/api.js';
import { formatDate, formatPaise } from '../lib/format.js';
import { BarcodeSvg } from './BarcodeSvg.js';

interface LabelBatch {
  id: string;
  code: string;
  bestBefore: string | null;
  item: { name: string; size: string | null; mrpPaise: number | null };
}
interface BusinessProfile {
  name: string;
  fssaiNumber: string | null;
}

// Label paper is 70 mm x 70 mm, one label per page. Code 128 needs about 11 modules per character,
// so a 20-character batch code is about 255 modules. At 0.22 mm per module that is about 56 mm,
// which fits inside the 70 mm label. 1 px is about 0.265 mm.
const MODULE_PX = 0.83;

// Works out how many labels the count asks for. Only packs in stock can be printed, so the request
// is refused when it is not a whole number of 1 or more, or when it is more than the packs in stock.
export function planLabelCount(inStockCount: number, countText: string): { count: number; error: string | null } {
  if (inStockCount === 0) return { count: 0, error: 'No packs of this batch are in stock' };
  const text = countText.trim();
  if (!/^\d+$/.test(text) || Number(text) < 1) {
    return { count: 0, error: 'Enter a number of labels, 1 or more' };
  }
  const count = Number(text);
  if (count > inStockCount) {
    return { count: 0, error: `Only ${inStockCount} pack${inStockCount === 1 ? '' : 's'} in stock. You asked for ${count}.` };
  }
  return { count, error: null };
}

// Styles for the labels on screen and in print. In print, only the labels are shown, one per page.
const labelPrintCss = `
  @page {
    size: 70mm 70mm;
    margin: 0;
  }

  .label {
    width: 70mm;
    height: 70mm;
    box-sizing: border-box;
    padding: 5mm 6mm;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    overflow: hidden;
    font-family: Arial, Helvetica, sans-serif;
    color: #000;
    background: #fff;
    break-after: page;
    page-break-after: always;
  }

  .label:last-child {
    break-after: auto;
    page-break-after: auto;
  }

  .label-row {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 2mm;
    font-size: 8pt;
    line-height: 1.2;
  }

  .label-row span:last-child {
    text-align: right;
  }

  .label-name {
    font-size: 14pt;
    font-weight: 700;
    line-height: 1.2;
  }

  .label-meta {
    font-size: 8pt;
    line-height: 1.3;
  }

  .label-barcode {
    display: flex;
    justify-content: center;
    align-items: center;
    width: 100%;
    overflow: hidden;
  }

  .label-barcode svg {
    display: block;
    max-width: 100%;
    height: auto;
  }

  @media screen {
    .label {
      border: 1px dashed #bbb;
    }
  }

  @media print {
    html,
    body {
      height: auto !important;
      overflow: visible !important;
      margin: 0 !important;
      padding: 0 !important;
      background: #fff !important;
    }

    #root {
      display: none !important;
    }

    .pl-root {
      position: static !important;
      display: block !important;
      padding: 0 !important;
      background: none !important;
    }

    .pl-panel {
      display: block !important;
      width: 70mm !important;
      max-height: none !important;
      overflow: visible !important;
      border: 0 !important;
      box-shadow: none !important;
      background: none !important;
    }

    .pl-chrome {
      display: none !important;
    }

    .pl-preview {
      display: block !important;
      overflow: visible !important;
      padding: 0 !important;
      background: none !important;
    }
  }
`;

// One label. Every label of a batch carries the batch barcode, so they are all the same.
function PackLabel({ batch, profile }: { batch: LabelBatch; profile: BusinessProfile }) {
  return (
    <div className="label">
      <div className="label-row">
        <span>{profile.name}</span>
        {batch.item.mrpPaise !== null && <span>MRP {formatPaise(batch.item.mrpPaise)} incl. GST</span>}
      </div>
      <div>
        <div className="label-name">{batch.item.name}</div>
        {batch.item.size && <div className="label-meta">Net wt: {batch.item.size}</div>}
      </div>
      <div className="label-barcode">
        <BarcodeSvg value={batch.code} width={MODULE_PX} height={40} />
      </div>
      <div className="label-meta">
        {batch.bestBefore && <div>Best before: {formatDate(batch.bestBefore)}</div>}
        {profile.fssaiNumber && <div>FSSAI: {profile.fssaiNumber}</div>}
      </div>
    </div>
  );
}

// Print pack labels for one batch, in this page (no new tab). The user picks how many labels; it
// cannot be more than the packs in stock, nor less than 1. Each label is printed on its own 70 mm page.
export function PackLabelPrint({ batchId, onClose }: { batchId: string; onClose: () => void }) {
  const [batch, setBatch] = useState<LabelBatch | null>(null);
  const [profile, setProfile] = useState<BusinessProfile | null>(null);
  const [inStockCount, setInStockCount] = useState<number | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [countText, setCountText] = useState('');

  useEffect(() => {
    Promise.all([
      api.get<LabelBatch>(`/batches/${batchId}`),
      api.get<BusinessProfile>('/business-profile'),
      api.get<{ code: string }[]>(`/batches/${batchId}/units`),
    ])
      .then(([b, p, units]) => {
        setBatch(b);
        setProfile(p);
        setInStockCount(units.length);
        // Start with one label for every pack in stock.
        setCountText(String(units.length));
      })
      .catch(() => setLoadError('Could not load this batch'));
  }, [batchId]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const plan = useMemo(
    () => (inStockCount === null ? { count: 0, error: null } : planLabelCount(inStockCount, countText)),
    [inStockCount, countText],
  );
  const error = loadError ?? plan.error;
  const ready = batch !== null && profile !== null && plan.error === null && plan.count > 0;
  const count = plan.count;
  const max = inStockCount ?? 0;

  function setCount(next: number) {
    setCountText(String(Math.max(1, Math.min(max, next))));
  }

  const content = (
    <div
      className="pl-root"
      role="dialog"
      aria-modal="true"
      aria-label="Print pack labels"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(13, 29, 20, .45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
    >
      <style>{labelPrintCss}</style>
      <div
        className="card pl-panel"
        style={{ width: 'min(960px, 100%)', maxHeight: '92vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', padding: 0, background: '#fff' }}
      >
        <div className="pl-chrome" style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 12, borderBottom: '1px solid var(--border-light)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 18, fontWeight: 700 }}>Print pack labels</div>
              <div className="muted" style={{ fontSize: 13.5 }}>{batch ? `${batch.code} · ${batch.item.name}` : 'Loading…'}</div>
            </div>
            <button type="button" className="btn" aria-label="Close" onClick={onClose} style={{ minHeight: 44, minWidth: 44 }}>
              ✕
            </button>
          </div>

          {inStockCount !== null && (
            <div className="muted" style={{ fontSize: 13.5 }}>
              {inStockCount} pack{inStockCount === 1 ? '' : 's'} in stock
            </div>
          )}

          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13 }}>
              Labels to print
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <button type="button" className="btn" aria-label="One fewer" disabled={count <= 1} onClick={() => setCount(count - 1)} style={{ minHeight: 44, width: 44, padding: 0 }}>
                  −
                </button>
                <input
                  className="in"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={max}
                  value={countText}
                  onChange={(e) => setCountText(e.target.value)}
                  style={{ width: 110, height: 44, textAlign: 'center' }}
                />
                <button type="button" className="btn" aria-label="One more" disabled={count >= max} onClick={() => setCount(count + 1)} style={{ minHeight: 44, width: 44, padding: 0 }}>
                  +
                </button>
              </div>
            </label>
            <button type="button" className="btn" disabled={max === 0} onClick={() => setCount(max)} style={{ minHeight: 44 }}>
              All in stock
            </button>
            <div style={{ flex: 1 }} />
            <div style={{ fontWeight: 700, fontSize: 15, minHeight: 44, display: 'flex', alignItems: 'center' }}>
              {ready ? `${count} label${count === 1 ? '' : 's'} to print` : ''}
            </div>
          </div>

          {error && <div className="error-banner">{error}</div>}
        </div>

        <div
          className="pl-preview"
          style={{ flex: 1, minHeight: 0, overflowY: 'auto', background: '#E9EEE7', padding: 16, display: 'flex', flexWrap: 'wrap', gap: 12, justifyContent: 'center', alignContent: 'flex-start' }}
        >
          {ready && batch && profile && Array.from({ length: count }, (_, i) => <PackLabel key={i} batch={batch} profile={profile} />)}
        </div>

        <div
          className="pl-chrome"
          style={{ padding: '12px 18px', borderTop: '1px solid var(--border-light)', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}
        >
          <span className="muted" style={{ fontSize: 12.5, flex: 1, minWidth: 240 }}>
            Printer: TSC TE244 · paper 70 × 70 mm · margins none · scale 100%
          </span>
          <button type="button" className="btn" onClick={onClose} style={{ minHeight: 44 }}>
            Cancel
          </button>
          <button type="button" className="btn p" disabled={!ready} onClick={() => window.print()} style={{ minHeight: 44 }}>
            {ready ? `Print ${count} label${count === 1 ? '' : 's'}` : 'Print'}
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(content, document.body);
}
