import { useEffect, useMemo, useState } from 'react';
import { api, ApiError } from '../lib/api.js';
import { formatDate } from '../lib/format.js';
import { SortTh, useTableSort } from '../lib/table-sort.js';
import { FilterControls, FilterSummary } from '../components/FilterToolbar.js';
import { InventoryFilterDrawer } from '../components/InventoryFilterDrawer.js';
import {
  DEFAULT_INVENTORY_FILTERS,
  NO_CATEGORY,
  countActiveInventoryFilters,
  describeInventoryFilters,
  filterInventory,
  type InventoryFilters,
} from '../lib/inventory-filters.js';
import { usePaging, TablePagination } from '../components/Pagination.js';
import { LoadingRow } from '../components/Skeleton.js';
import { useLoadingList } from '../lib/request-activity.js';

interface InventoryBatch {
  id: string;
  code: string;
  bestBefore: string | null;
  supplier: { name: string } | null;
  qty: string;
}
interface InventoryItem {
  id: string;
  code: string;
  name: string;
  size: string | null;
  unit: string;
  category: { name: string } | null;
  reorderLevel: number | null;
  trackBatches: boolean;
  totalQty: string;
  batches: InventoryBatch[];
}


const inventorySortValues = {
  item: (i: InventoryItem) => i.name,
  category: (i: InventoryItem) => i.category?.name,
  onHand: (i: InventoryItem) => Number(i.totalQty),
  reorder: (i: InventoryItem) => i.reorderLevel,
};

export function InventoryPage() {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const loading = useLoadingList();
  const [selected, setSelected] = useState<InventoryItem | null>(null);
  const [batchId, setBatchId] = useState('');
  const [qtyDelta, setQtyDelta] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function load() {
    api.get<InventoryItem[]>('/items/inventory').then((all) => {
      setItems(all);
      if (selected) {
        const refreshed = all.find((i) => i.id === selected.id);
        setSelected(refreshed ?? null);
      }
    });
  }

  useEffect(load, []);

  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState<InventoryFilters>(DEFAULT_INVENTORY_FILTERS);
  const visible = useMemo(() => filterInventory(items, filters, search), [items, filters, search]);
  const sortable = useTableSort(visible, inventorySortValues);

  // Category names come from the stock itself, since each row carries its category name.
  const categoryOptions = useMemo(() => {
    const names = [...new Set(items.map((i) => i.category?.name).filter((n): n is string => !!n))].sort((a, b) => a.localeCompare(b));
    return [
      { value: '', label: 'All categories' },
      { value: NO_CATEGORY, label: 'No category' },
      ...names.map((name) => ({ value: name, label: name })),
    ];
  }, [items]);

  function select(item: InventoryItem) {
    setSelected(item);
    setBatchId(item.batches[0]?.id ?? '');
    setQtyDelta('');
    setReason('');
    setError(null);
  }

  async function submitAdjustment(e: React.FormEvent) {
    e.preventDefault();
    if (!selected || !batchId) return;
    setError(null);
    setSaving(true);
    try {
      await api.post('/stock-adjustments', {
        itemId: selected.id,
        batchId,
        qtyDelta: Number(qtyDelta),
        reason,
      });
      setQtyDelta('');
      setReason('');
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save adjustment');
    } finally {
      setSaving(false);
    }
  }

  const { pageRows, paging } = usePaging(sortable.rows);

  return (
    <>
      <div className="top">
        <h1>Inventory</h1>
        <div style={{ flex: 1 }} />
        <FilterControls
          search={search}
          onSearch={setSearch}
          searchLabel="Search stock"
          searchPlaceholder="Search item, code, batch or supplier"
          compactSearch
          activeCount={countActiveInventoryFilters(filters)}
          renderDrawer={(close) => (
            <InventoryFilterDrawer
              initial={filters}
              search={search}
              items={items}
              categoryOptions={categoryOptions}
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
            activeCount={countActiveInventoryFilters(filters)}
            chips={describeInventoryFilters(filters).map((chip) => ({
              key: chip.key,
              label: chip.label,
              onRemove: () => setFilters({ ...filters, ...chip.patch }),
            }))}
            onClearAll={() => setFilters(DEFAULT_INVENTORY_FILTERS)}
            shown={visible.length}
            total={items.length}
            noun="items"
          />
          <table className="tbl">
            <thead>
              <tr>
                <SortTh label="Item" sortKey="item" sort={sortable.sort} onSort={sortable.toggle} />
                <SortTh label="Type" sortKey="type" sort={sortable.sort} onSort={sortable.toggle} />
                <SortTh label="On hand" sortKey="onHand" align="r" sort={sortable.sort} onSort={sortable.toggle} />
                <SortTh label="Reorder level" sortKey="reorder" align="r" sort={sortable.sort} onSort={sortable.toggle} />
                <th></th>
              </tr>
            </thead>
            <tbody>
              {pageRows.map((item) => {
                const totalQty = Number(item.totalQty);
                const low = item.reorderLevel !== null && totalQty <= item.reorderLevel;
                return (
                  <tr key={item.id} className={selected?.id === item.id ? 'sel' : ''}>
                    <td>
                      <b>{item.name}</b>
                      {item.size && <div className="muted" style={{ fontSize: 12.5 }}>{item.size}</div>}
                      <div className="muted" style={{ fontSize: 12 }}>{item.code}</div>
                    </td>
                    <td>{item.category ? <span className="pill n">{item.category.name}</span> : <span className="muted">—</span>}</td>
                    <td className="r">
                      {totalQty} {item.unit}
                      {low && <span className="pill a" style={{ marginLeft: 6 }}>Low</span>}
                    </td>
                    <td className="r muted">{item.reorderLevel ?? '–'}</td>
                    <td><button type="button" className="btn" onClick={() => select(item)}>View / adjust</button></td>
                  </tr>
                );
              })}
              {visible.length === 0 && loading && <LoadingRow columns={5} />}
              {visible.length === 0 && !loading && (
                <tr>
                  <td colSpan={5} style={{ textAlign: 'center', padding: 40 }}>
                    {items.length === 0 ? (
                      <span className="muted">No stock yet</span>
                    ) : (
                      <>
                        <div style={{ fontWeight: 600 }}>No items match these filters</div>
                        <button
                          type="button"
                          className="btn"
                          style={{ marginTop: 14 }}
                          onClick={() => {
                            setFilters(DEFAULT_INVENTORY_FILTERS);
                            setSearch('');
                          }}
                        >
                          Reset filters
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
            <TablePagination {...paging} />
        </div>

        {selected && (
          <div className="card" style={{ width: 380, flex: 'none', padding: 18, display: 'flex', flexDirection: 'column', gap: 12, overflow: 'auto' }}>
            <div>
              <div style={{ fontSize: 18, fontWeight: 700 }}>{selected.name}</div>
              <div className="muted" style={{ fontSize: 13.5 }}>{selected.code}{selected.category ? ` · ${selected.category.name}` : ''}</div>
            </div>
            <div style={{ background: 'var(--bg)', borderRadius: 10, padding: 12 }}>
              <div className="muted" style={{ fontSize: 12 }}>Total on hand</div>
              <div style={{ fontSize: 24, fontWeight: 700 }}>{selected.totalQty} {selected.unit}</div>
            </div>

            <div>
              <div className="muted" style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', marginBottom: 6 }}>Batches</div>
              {selected.batches.map((b) => (
                <div key={b.id} className="row">
                  <span>
                    <b>{b.code}</b>
                    {b.bestBefore && <span className="muted"> &middot; BB {formatDate(b.bestBefore)}</span>}
                  </span>
                  <span>{b.qty}</span>
                </div>
              ))}
              {selected.batches.length === 0 && <div className="muted" style={{ fontSize: 13 }}>No stock on hand</div>}
            </div>

            <form onSubmit={submitAdjustment} style={{ borderTop: '1px solid var(--border-light)', paddingTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div className="lbl">Adjust stock</div>
              {error && <div className="error-banner">{error}</div>}
              <div>
                <label className="lbl" htmlFor="batch" style={{ fontWeight: 500 }}>Batch</label>
                <select id="batch" className="in" value={batchId} onChange={(e) => setBatchId(e.target.value)} required>
                  <option value="">Select batch</option>
                  {selected.batches.map((b) => (
                    <option key={b.id} value={b.id}>{b.code} (on hand {b.qty})</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="lbl" htmlFor="qtyDelta" style={{ fontWeight: 500 }}>Qty change (+ to add, - to remove)</label>
                <input id="qtyDelta" className="in" type="number" step="0.001" value={qtyDelta} onChange={(e) => setQtyDelta(e.target.value)} required />
              </div>
              <div>
                <label className="lbl" htmlFor="reason" style={{ fontWeight: 500 }}>Reason</label>
                <input id="reason" className="in" placeholder="e.g. physical count correction, damaged" value={reason} onChange={(e) => setReason(e.target.value)} required />
              </div>
              <button type="submit" className="btn p" disabled={saving || !batchId}>{saving ? 'Saving…' : 'Save adjustment'}</button>
            </form>
          </div>
        )}
      </div>
    </>
  );
}
