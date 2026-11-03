import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { formatDate } from '../lib/format.js';
import { isExpired } from '@farm-sales/shared';
import { SortTh, useTableSort } from '../lib/table-sort.js';
import { BarcodeSvg } from '../components/BarcodeSvg.js';

interface BatchListRow {
  id: string;
  code: string;
  bestBefore: string | null;
  status: 'ACTIVE' | 'HOLD';
  item: { name: string };
  supplier: { name: string } | null;
  stockBalances: { qty: string }[];
}

interface BatchDetail extends BatchListRow {
}

const batchSortValues = {
  batch: (b: BatchListRow) => b.code,
  source: (b: BatchListRow) => b.supplier?.name,
  bestBefore: (b: BatchListRow) => (b.bestBefore ? new Date(b.bestBefore) : null),
  onHand: (b: BatchListRow) => Number(b.stockBalances[0]?.qty ?? 0),
  status: (b: BatchListRow) => b.status,
};

export function BatchesPage() {
  const [search, setSearch] = useState('');
  const [batches, setBatches] = useState<BatchListRow[]>([]);
  const [selected, setSelected] = useState<BatchDetail | null>(null);
  // Best-before correction for the selected batch: null means not editing.
  const [editingBestBefore, setEditingBestBefore] = useState<string | null>(null);
  // How many pack labels to print for the selected batch. Starts at the packs in stock.
  const [labelCount, setLabelCount] = useState('1');
  const [bestBeforeError, setBestBeforeError] = useState<string | null>(null);
  const sortable = useTableSort(batches, batchSortValues);

  async function saveBestBefore() {
    if (!selected) return;
    setBestBeforeError(null);
    try {
      await api.patch(`/batches/${selected.id}`, { bestBefore: editingBestBefore || null });
      setEditingBestBefore(null);
      await select(selected.id);
      api.get<BatchListRow[]>(`/batches${search ? `?search=${encodeURIComponent(search)}` : ''}`).then(setBatches);
    } catch (err) {
      setBestBeforeError(err instanceof Error ? err.message : 'Could not save the date');
    }
  }

  useEffect(() => {
    const query = search ? `?search=${encodeURIComponent(search)}` : '';
    api.get<BatchListRow[]>(`/batches${query}`).then(setBatches);
  }, [search]);

  async function select(id: string) {
    const detail = await api.get<BatchDetail>(`/batches/${id}`);
    setSelected(detail);
  }

  return (
    <>
      <div className="top">
        <h1>Batches</h1>
        <div style={{ flex: 1 }} />
        <input className="in" style={{ width: 260 }} placeholder="Search batch or item" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>
      <div className="body">
        <div className="card" style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
          <table className="tbl">
            <thead>
              <tr>
                <SortTh label="Batch" sortKey="batch" sort={sortable.sort} onSort={sortable.toggle} />
                <SortTh label="Source" sortKey="source" sort={sortable.sort} onSort={sortable.toggle} />
                <SortTh label="Best before" sortKey="bestBefore" sort={sortable.sort} onSort={sortable.toggle} />
                <SortTh label="On hand" sortKey="onHand" align="r" sort={sortable.sort} onSort={sortable.toggle} />
                <SortTh label="Status" sortKey="status" sort={sortable.sort} onSort={sortable.toggle} />
              </tr>
            </thead>
            <tbody>
              {sortable.rows.map((b) => (
                <tr key={b.id} className={selected?.id === b.id ? 'sel' : ''} style={{ cursor: 'pointer' }} onClick={() => select(b.id)}>
                  <td>
                    <b>{b.code}</b>
                    <div className="muted" style={{ fontSize: 12.5 }}>{b.item.name}</div>
                  </td>
                  <td>{b.supplier?.name ?? '–'}</td>
                  <td>
                    {formatDate(b.bestBefore)}
                    {isExpired(b.bestBefore) && <span className="pill rd" style={{ marginLeft: 6 }}>Expired</span>}
                  </td>
                  <td className="r">{b.stockBalances[0]?.qty ?? 0}</td>
                  <td><span className={`pill ${b.status === 'ACTIVE' ? 'g' : 'a'}`}>{b.status === 'ACTIVE' ? 'Active' : 'On hold'}</span></td>
                </tr>
              ))}
              {batches.length === 0 && (
                <tr><td colSpan={5} className="muted" style={{ padding: 20, textAlign: 'center' }}>No batches yet</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {selected && (
          <div className="card" style={{ width: 380, flex: 'none', padding: 18, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <div style={{ fontSize: 18, fontWeight: 700 }}>{selected.code}</div>
              <div className="muted" style={{ fontSize: 13.5 }}>{selected.item.name} · best before {formatDate(selected.bestBefore)}</div>
              {isExpired(selected.bestBefore) && (
                <div className="error-banner" style={{ marginTop: 8 }}>Expired. This stock cannot be sold.</div>
              )}
              {editingBestBefore === null ? (
                <button type="button" className="btn" style={{ marginTop: 8 }} onClick={() => setEditingBestBefore(selected.bestBefore ? selected.bestBefore.slice(0, 10) : '')}>
                  Edit best-before date
                </button>
              ) : (
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8, flexWrap: 'wrap' }}>
                  <input className="in" type="date" value={editingBestBefore} onChange={(e) => setEditingBestBefore(e.target.value)} />
                  <button type="button" className="btn p" onClick={saveBestBefore}>Save date</button>
                  <button type="button" className="btn" onClick={() => { setEditingBestBefore(null); setBestBeforeError(null); }}>Cancel</button>
                  {editingBestBefore === '' && <span className="muted" style={{ fontSize: 12 }}>Leave empty to remove the date</span>}
                </div>
              )}
              {bestBeforeError && <div className="error-banner" style={{ marginTop: 8 }}>{bestBeforeError}</div>}
            </div>
            <div style={{ background: '#fff', border: '1px solid var(--border-light)', borderRadius: 10, padding: 12, display: 'flex', justifyContent: 'center' }}>
              <BarcodeSvg value={selected.code} />
            </div>
            <div style={{ background: 'var(--bg)', borderRadius: 10, padding: 12 }}>
              <div className="muted" style={{ fontSize: 12 }}>On hand</div>
              <div style={{ fontSize: 24, fontWeight: 700 }}>{selected.stockBalances[0]?.qty ?? 0}</div>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <label htmlFor="labelCount" className="muted" style={{ fontSize: 13 }}>Labels</label>
              <input
                id="labelCount"
                className="in"
                type="number"
                min={1}
                value={labelCount}
                onChange={(e) => setLabelCount(e.target.value)}
                style={{ width: 90 }}
              />
              <button
                type="button"
                className="btn p"
                title="Prints the number of labels in the box, from the packs in stock"
                onClick={() => window.open(`/labels/batch/${selected.id}?count=${Math.max(1, Math.floor(Number(labelCount) || 1))}`, '_blank')}
              >
                Print pack labels
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
