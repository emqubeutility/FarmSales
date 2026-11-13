import { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api.js';
import { formatDate } from '../lib/format.js';
import { isExpired } from '@farm-sales/shared';
import { SortTh, useTableSort } from '../lib/table-sort.js';
import { BarcodeSvg } from '../components/BarcodeSvg.js';
import { PackLabelPrint } from '../components/PackLabelPrint.js';
import { BatchFilterDrawer } from '../components/BatchFilterDrawer.js';
import { FilterControls, FilterSummary } from '../components/FilterToolbar.js';
import {
  DEFAULT_BATCH_FILTERS,
  NO_SUPPLIER,
  countActiveBatchFilters,
  describeBatchFilters,
  filterBatches,
  type BatchFilters,
} from '../lib/batch-filters.js';
import { usePaging, TablePagination } from '../components/Pagination.js';
import { LoadingRow } from '../components/Skeleton.js';
import { useLoadingList } from '../lib/request-activity.js';

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
  const loading = useLoadingList();
  const [selected, setSelected] = useState<BatchDetail | null>(null);
  // Best-before correction for the selected batch: null means not editing.
  const [editingBestBefore, setEditingBestBefore] = useState<string | null>(null);
  // The batch whose pack labels are open in the print dialog, if any.
  const [printingBatchId, setPrintingBatchId] = useState<string | null>(null);
  const [bestBeforeError, setBestBeforeError] = useState<string | null>(null);
  const [filters, setFilters] = useState<BatchFilters>(DEFAULT_BATCH_FILTERS);
  const visible = useMemo(() => filterBatches(batches, filters), [batches, filters]);
  const sortable = useTableSort(visible, batchSortValues);

  // Supplier names come from the batches themselves, since each row carries its supplier name.
  const supplierOptions = useMemo(() => {
    const names = [...new Set(batches.map((b) => b.supplier?.name).filter((n): n is string => !!n))].sort((a, b) => a.localeCompare(b));
    return [
      { value: '', label: 'All suppliers' },
      { value: NO_SUPPLIER, label: 'No supplier' },
      ...names.map((name) => ({ value: name, label: name })),
    ];
  }, [batches]);

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

  const { pageRows, paging } = usePaging(sortable.rows);

  return (
    <>
      <div className="top">
        <h1>Batches</h1>
        <div style={{ flex: 1 }} />
        <FilterControls
          search={search}
          onSearch={setSearch}
          searchLabel="Search batches"
          searchPlaceholder="Search batch or item"
          compactSearch
          activeCount={countActiveBatchFilters(filters)}
          renderDrawer={(close) => (
            <BatchFilterDrawer
              initial={filters}
              batches={batches}
              supplierOptions={supplierOptions}
              onClose={close}
              onApply={(next) => {
                setFilters(next);
                close();
              }}
            />
          )}
        />
      </div>
      <div className="body">
        <div className="card" style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
          <FilterSummary
            activeCount={countActiveBatchFilters(filters)}
            chips={describeBatchFilters(filters).map((chip) => ({
              key: chip.key,
              label: chip.label,
              onRemove: () => setFilters({ ...filters, ...chip.patch }),
            }))}
            onClearAll={() => setFilters(DEFAULT_BATCH_FILTERS)}
            shown={visible.length}
            total={batches.length}
            noun="batches"
          />
          <table className="tbl">
            <thead>
              <tr>
                <SortTh label="Batch" sortKey="batch" sort={sortable.sort} onSort={sortable.toggle} />
                <SortTh label="Source" sortKey="source" sort={sortable.sort} onSort={sortable.toggle} />
                <SortTh label="Best before" sortKey="bestBefore" sort={sortable.sort} onSort={sortable.toggle} />
                <SortTh label="On hand" sortKey="onHand" align="r" sort={sortable.sort} onSort={sortable.toggle} />
                <SortTh label="Status" sortKey="status" sort={sortable.sort} onSort={sortable.toggle} />
                <th></th>
              </tr>
            </thead>
            <tbody>
              {pageRows.map((b) => (
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
                  <td className="r">
                    <button
                      type="button"
                      className="btn"
                      style={{ minHeight: 44 }}
                      onClick={(e) => {
                        // Print without also opening the details panel for this row.
                        e.stopPropagation();
                        setPrintingBatchId(b.id);
                      }}
                    >
                      Print labels
                    </button>
                  </td>
                </tr>
              ))}
              {batches.length === 0 && loading && <LoadingRow columns={6} />}
              {batches.length === 0 && !loading && (
                <tr><td colSpan={6} className="muted" style={{ padding: 20, textAlign: 'center' }}>No batches yet</td></tr>
              )}
              {batches.length > 0 && visible.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: 40 }}>
                    <div style={{ fontWeight: 600 }}>No batches match these filters</div>
                    <button type="button" className="btn" style={{ marginTop: 14 }} onClick={() => setFilters(DEFAULT_BATCH_FILTERS)}>
                      Reset filters
                    </button>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
            <TablePagination {...paging} />
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
          </div>
        )}
      </div>
      {printingBatchId && <PackLabelPrint batchId={printingBatchId} onClose={() => setPrintingBatchId(null)} />}
    </>
  );
}
