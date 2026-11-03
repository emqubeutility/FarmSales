import { useEffect, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api.js';
import { formatDate, formatPaise } from '../lib/format.js';
import { BarcodeSvg } from '../components/BarcodeSvg.js';

interface BatchLabelData {
  id: string;
  code: string;
  bestBefore: string | null;
  item: { name: string; size: string | null; mrpPaise: number | null };
}
interface BusinessProfile {
  name: string;
  fssaiNumber: string | null;
}

// Label paper is 70 mm x 70 mm. Code 128 needs about 11 modules per character, so a 20-character
// batch code is about 255 modules. At 0.22 mm per module that is about 56 mm, which fits inside
// the 70 mm label with a margin each side. Change MODULE_PX if the test print is too wide or
// too faint: 1 px is about 0.265 mm.
const MODULE_PX = 0.83;

// Printable pack labels, no sidebar, same as the bill page. Open it from Batches > Print pack labels.
// ?count=N prints the first N packs in stock; without it, one label for every pack in stock.
// One label per pack still in stock. Each label carries its own pack code (for example
// BANSI500-261026A-0001), so each pack can be scanned on its own at the counter.
export function BatchLabelPage() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const [batch, setBatch] = useState<BatchLabelData | null>(null);
  const [profile, setProfile] = useState<BusinessProfile | null>(null);
  const [codes, setCodes] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Scanner check: scan a printed label into this box to see what the scanner reads. It sits
  // outside the printed label, and it is focused so a scan never presses the Print button.
  const [scanText, setScanText] = useState('');
  const [scanResult, setScanResult] = useState<{ read: string; matches: boolean } | null>(null);
  const scanRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!id) return;
    Promise.all([
      api.get<BatchLabelData>(`/batches/${id}`),
      api.get<BusinessProfile>('/business-profile'),
      api.get<{ code: string }[]>(`/batches/${id}/units`),
    ])
      .then(([b, p, units]) => {
        setBatch(b);
        setProfile(p);
        setCodes(units.map((u) => u.code));
      })
      .catch(() => setError('Could not load this batch'));
  }, [id]);

  useEffect(() => {
    scanRef.current?.focus();
  }, [batch]);

  if (error) return <div className="error-banner" style={{ margin: 16 }}>{error}</div>;
  if (!batch || !profile || !codes) return <div style={{ padding: 16 }}>Loading…</div>;

  const requested = Number(searchParams.get('count'));
  const toPrint = Number.isInteger(requested) && requested > 0 ? codes.slice(0, requested) : codes;

  return (
    <>
      <style>{`
  @page {
    size: 70mm 70mm;
    margin: 0;
  }

  html,
  body {
    margin: 0 !important;
    padding: 0 !important;
    width: 70mm;
  }

  * {
    box-sizing: border-box;
  }

  .label-sheet {
    font-family: Arial, Helvetica, sans-serif;
    color: #000;
    background: #fff;
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
  page-break-after: always;
  break-after: page;
}

  .label:last-child {
    page-break-after: auto;
    break-after: auto;
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
    body {
      width: auto;
    }

    .label-sheet {
      padding: 16px;
      display: flex;
      flex-direction: column;
      gap: 12px;
      align-items: flex-start;
    }

    .label {
      border: 1px dashed #bbb;
    }
  }

  @media print {
    html,
    body,
    #root {
      width: 70mm !important;
      margin: 0 !important;
      padding: 0 !important;
    }

    .no-print {
      display: none !important;
    }

    .label-sheet {
      display: block !important;
      width: 70mm !important;
      margin: 0 !important;
      padding: 0 !important;
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
  page-break-after: always;
  break-after: page;
}

    .label:last-child {
      page-break-after: auto;
      break-after: auto;
    }
  }
`}</style>

      <div className="no-print" style={{ padding: 16, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', fontFamily: 'Arial, sans-serif' }}>
        <strong>{toPrint.length} pack label{toPrint.length === 1 ? '' : 's'} for {batch.code}{toPrint.length < codes.length ? ` (of ${codes.length} in stock)` : ''}</strong>
        <button type="button" onClick={() => window.print()} style={{ minHeight: 40, padding: '0 16px' }}>Print</button>
        <span style={{ fontSize: 13, color: '#555' }}>
          Printer settings: paper 70 × 70 mm, margins none, scale 100%. Choose the TSC TE244 as the printer.
        </span>
      </div>

      <div className="no-print" style={{ padding: '0 16px 16px', fontFamily: 'Arial, sans-serif', display: 'flex', flexDirection: 'column', gap: 6, maxWidth: 520 }}>
        <label htmlFor="scanCheck" style={{ fontSize: 13, fontWeight: 700 }}>Scanner check: scan the barcode here</label>
        <input
          id="scanCheck"
          ref={scanRef}
          value={scanText}
          autoComplete="off"
          onChange={(e) => setScanText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== 'Enter') return;
            e.preventDefault();
            const read = scanText.trim();
            setScanResult({ read, matches: codes.includes(read) });
            setScanText('');
          }}
          style={{ height: 44, fontSize: 16, padding: '0 10px', border: '1px solid #bbb', borderRadius: 6 }}
        />
        {scanResult && (
          <div style={{ fontSize: 14, color: scanResult.matches ? '#14502F' : '#9B1C1C', fontWeight: 600 }}>
            Scanner read: <span style={{ fontFamily: 'monospace' }}>{scanResult.read || '(nothing)'}</span>
            {' — '}
            {scanResult.matches ? 'matches a pack label in stock' : `is not a pack label in stock for ${batch.code}`}
          </div>
        )}
      </div>

      <div className="label-sheet">
        {toPrint.map((code) => (
          <div className="label" key={code}>
            <div className="label-row">
              <span>{profile.name}</span>
              {batch.item.mrpPaise !== null && <span>MRP {formatPaise(batch.item.mrpPaise)} incl. GST</span>}
            </div>
            <div>
              <div className="label-name">{batch.item.name}</div>
              {batch.item.size && <div className="label-meta">Net wt: {batch.item.size}</div>}
            </div>
            <div className="label-barcode">
              <BarcodeSvg value={code} width={MODULE_PX} height={40} />
            </div>
            <div className="label-meta">
              {batch.bestBefore && <div>Best before: {formatDate(batch.bestBefore)}</div>}
              {profile.fssaiNumber && <div>FSSAI: {profile.fssaiNumber}</div>}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
