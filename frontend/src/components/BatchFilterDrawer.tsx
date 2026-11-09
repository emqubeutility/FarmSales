import { useMemo, useState } from 'react';
import { Dropdown, type DropdownOption } from './Dropdown.js';
import { FilterDrawer, FilterSection } from './FilterDrawer.js';
import {
  BATCH_EXPIRY_OPTIONS,
  BATCH_STATUS_OPTIONS,
  BATCH_STOCK_OPTIONS,
  DEFAULT_BATCH_FILTERS,
  countActiveBatchFilters,
  filterBatches,
  type BatchFilters,
  type FilterableBatch,
} from '../lib/batch-filters.js';

interface BatchFilterDrawerProps {
  /** The filters in use when the drawer opened. Edits stay local until Show is pressed. */
  initial: BatchFilters;
  batches: FilterableBatch[];
  /** Supplier choices, including "All" and "No supplier". */
  supplierOptions: DropdownOption<string>[];
  onApply: (next: BatchFilters) => void;
  onClose: () => void;
}

// The Batches filters: status, best-before date, supplier and stock on hand.
export function BatchFilterDrawer({ initial, batches, supplierOptions, onApply, onClose }: BatchFilterDrawerProps) {
  const [draft, setDraft] = useState<BatchFilters>(initial);
  const matchCount = useMemo(() => filterBatches(batches, draft).length, [batches, draft]);
  const activeCount = countActiveBatchFilters(draft);

  function set(patch: Partial<BatchFilters>) {
    setDraft((d) => ({ ...d, ...patch }));
  }

  return (
    <FilterDrawer
      title="Filters"
      subtitle={activeCount === 0 ? 'Nothing applied' : `${activeCount} ${activeCount === 1 ? 'group' : 'groups'} applied`}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn fd-reset" disabled={activeCount === 0} onClick={() => setDraft(DEFAULT_BATCH_FILTERS)}>
            Reset
          </button>
          <button type="button" className="btn p fd-apply" onClick={() => onApply(draft)}>
            Show {matchCount} {matchCount === 1 ? 'batch' : 'batches'}
          </button>
        </>
      }
    >
      <FilterSection label="Status" htmlFor="batch-status">
        <Dropdown id="batch-status" value={draft.status} options={BATCH_STATUS_OPTIONS} onChange={(status) => set({ status })} />
      </FilterSection>

      <FilterSection label="Best-before date" htmlFor="batch-expiry">
        <Dropdown id="batch-expiry" value={draft.expiry} options={BATCH_EXPIRY_OPTIONS} onChange={(expiry) => set({ expiry })} />
      </FilterSection>

      <FilterSection label="Supplier" htmlFor="batch-supplier">
        <Dropdown id="batch-supplier" value={draft.supplier} options={supplierOptions} onChange={(supplier) => set({ supplier })} />
      </FilterSection>

      <FilterSection label="Stock on hand" htmlFor="batch-stock">
        <Dropdown id="batch-stock" value={draft.stock} options={BATCH_STOCK_OPTIONS} onChange={(stock) => set({ stock })} />
      </FilterSection>
    </FilterDrawer>
  );
}
