import { useMemo, useState } from 'react';
import { checkTransfer, POOL_LABELS, PLATFORM_SOURCES, TransferError } from '@farm-sales/shared';
import type { PlatformSource, StockPool } from '@farm-sales/shared';
import { api, ApiError } from '../lib/api.js';
import { Field, Modal, Notice } from './ui.js';

export interface TransferReservation {
  source: 'FLIPKART' | 'AMAZON' | 'SHOPIFY' | 'DIRECT';
  reserved: number;
  held: number;
}

export interface TransferBatch {
  id: string;
  code: string;
  qty: number;
  reservations: TransferReservation[];
}

interface Props {
  itemId: string;
  itemName: string;
  unit: string;
  batches: TransferBatch[];
  initialBatchId: string;
  onClose: () => void;
  onDone: () => void;
}

const pools: StockPool[] = ['FREE', ...PLATFORM_SOURCES];

// Per-pool numbers for one batch: free stock and what each platform can still sell.
function poolsOf(batch: TransferBatch) {
  const reserved: Partial<Record<PlatformSource, number>> = {};
  const held: Partial<Record<PlatformSource, number>> = {};
  let reservedByDirect = 0;
  for (const r of batch.reservations) {
    if (r.source === 'DIRECT') reservedByDirect += r.reserved;
    else {
      reserved[r.source] = r.reserved;
      held[r.source] = r.held;
    }
  }
  const reservedAll = batch.reservations.reduce((sum, r) => sum + r.reserved, 0);
  const free = Math.round((batch.qty - reservedAll) * 1000) / 1000;
  const available = (p: PlatformSource) => Math.round(((reserved[p] ?? 0) - (held[p] ?? 0)) * 1000) / 1000;
  return { reserved, held, reservedByDirect, free, available };
}

// Stock in one place, before and after the move.
function amountIn(pool: StockPool, info: ReturnType<typeof poolsOf>): number {
  return pool === 'FREE' ? info.free : info.available(pool);
}

export function StockTransferDialog({ itemId, itemName, unit, batches, initialBatchId, onClose, onDone }: Props) {
  const [batchId, setBatchId] = useState(initialBatchId);
  const batch = batches.find((b) => b.id === batchId) ?? batches[0];
  const info = useMemo(() => poolsOf(batch), [batch]);

  // Only places that have stock for this batch can be the source.
  const fromChoices = pools.filter((p) => amountIn(p, info) > 0);
  const [from, setFrom] = useState<StockPool | ''>('');
  const fromValue = (from && fromChoices.includes(from) ? from : fromChoices[0]) ?? 'FREE';
  const toChoices = pools.filter((p) => p !== fromValue);
  const [to, setTo] = useState<StockPool | ''>('');
  const toValue = (to && toChoices.includes(to) ? to : toChoices[0]) ?? 'FREE';

  const [qtyText, setQtyText] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const qty = Number(qtyText);
  let problem: string | undefined;
  if (qtyText.trim() !== '') {
    try {
      checkTransfer({
        onHand: batch.qty,
        reserved: info.reserved,
        reservedByDirect: info.reservedByDirect,
        held: info.held,
        from: fromValue,
        to: toValue,
        qty,
      });
    } catch (err) {
      if (err instanceof TransferError) problem = err.message;
    }
  }
  const canSave = qtyText.trim() !== '' && !problem && !saving;

  // Numbers after the move, shown before saving.
  const after = (pool: StockPool) => {
    const before = amountIn(pool, info);
    if (qtyText.trim() === '' || problem) return before;
    if (pool === fromValue) return Math.round((before - qty) * 1000) / 1000;
    if (pool === toValue) return Math.round((before + qty) * 1000) / 1000;
    return before;
  };

  async function save() {
    setError(null);
    setSaving(true);
    try {
      await api.post('/reservations/transfer', { itemId, batchId: batch.id, from: fromValue, to: toValue, qty, note: note.trim() || undefined });
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not move the stock');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      title="Move reserved stock"
      subtitle={`${itemName} · Only the free and available stock can move. Held stock stays with its order.`}
      onClose={onClose}
      width={600}
      footer={
        <>
          <button type="button" className="btn" style={{ minHeight: 44 }} onClick={onClose}>Cancel</button>
          <button type="button" className="btn p" style={{ minHeight: 44 }} disabled={!canSave} onClick={() => void save()}>
            {saving ? 'Moving…' : 'Move stock'}
          </button>
        </>
      }
    >
      {error && <Notice kind="error">{error}</Notice>}
      {problem && <Notice kind="error">{problem}</Notice>}

      <Field label="Batch">
        {({ id }) => (
          <select id={id} className="in" value={batch.id} onChange={(e) => { setBatchId(e.target.value); setFrom(''); setTo(''); }}>
            {batches.map((b) => (
              <option key={b.id} value={b.id}>{b.code} · on hand {b.qty} {unit}</option>
            ))}
          </select>
        )}
      </Field>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 14 }}>
        <Field label="From">
          {({ id }) => (
            <select id={id} className="in" value={fromValue} onChange={(e) => setFrom(e.target.value as StockPool)}>
              {fromChoices.map((p) => (
                <option key={p} value={p}>{POOL_LABELS[p]} ({amountIn(p, info)} {unit})</option>
              ))}
            </select>
          )}
        </Field>
        <Field label="To">
          {({ id }) => (
            <select id={id} className="in" value={toValue} onChange={(e) => setTo(e.target.value as StockPool)}>
              {toChoices.map((p) => (
                <option key={p} value={p}>{POOL_LABELS[p]}</option>
              ))}
            </select>
          )}
        </Field>
      </div>

      <Field label={`Quantity (${unit})`} required>
        {({ id }) => (
          <input id={id} className="in" inputMode="decimal" aria-invalid={!!problem} value={qtyText} onChange={(e) => setQtyText(e.target.value)} placeholder="0" />
        )}
      </Field>

      <div style={{ background: 'var(--bg)', borderRadius: 10, padding: 12, display: 'grid', gap: 6, fontSize: 14 }}>
        <div className="muted" style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase' }}>After this move</div>
        {[fromValue, toValue].map((p) => (
          <div key={p} style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>{POOL_LABELS[p]}</span>
            <span>
              <b>{amountIn(p, info)}</b> → <b>{after(p)}</b> {unit}
            </span>
          </div>
        ))}
      </div>

      <Field label="Reason (optional)">
        {({ id }) => (
          <input id={id} className="in" value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Amazon demand is higher this week" />
        )}
      </Field>
    </Modal>
  );
}
