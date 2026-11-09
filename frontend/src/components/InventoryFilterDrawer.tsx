import { useMemo, useState } from 'react';
import { Dropdown, type DropdownOption } from './Dropdown.js';
import { FilterDrawer, FilterSection } from './FilterDrawer.js';
import {
  DEFAULT_INVENTORY_FILTERS,
  EXPIRY_OPTIONS,
  INVENTORY_TRACKING_OPTIONS,
  STOCK_OPTIONS,
  countActiveInventoryFilters,
  filterInventory,
  type FilterableInventoryItem,
  type InventoryFilters,
} from '../lib/inventory-filters.js';

interface InventoryFilterDrawerProps {
  /** The filters in use when the drawer opened. Edits stay local until Show is pressed. */
  initial: InventoryFilters;
  /** The search text on the page, so the count matches what Show will display. */
  search: string;
  items: FilterableInventoryItem[];
  /** Category choices, including "All" and "No category". */
  categoryOptions: DropdownOption<string>[];
  onApply: (next: InventoryFilters) => void;
  onClose: () => void;
}

// The Inventory filters: stock level, batch expiry, category and stock tracking.
export function InventoryFilterDrawer({ initial, search, items, categoryOptions, onApply, onClose }: InventoryFilterDrawerProps) {
  const [draft, setDraft] = useState<InventoryFilters>(initial);
  const matchCount = useMemo(() => filterInventory(items, draft, search).length, [items, draft, search]);
  const activeCount = countActiveInventoryFilters(draft);

  function set(patch: Partial<InventoryFilters>) {
    setDraft((d) => ({ ...d, ...patch }));
  }

  return (
    <FilterDrawer
      title="Filters"
      subtitle={activeCount === 0 ? 'Nothing applied' : `${activeCount} ${activeCount === 1 ? 'group' : 'groups'} applied`}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn fd-reset" disabled={activeCount === 0} onClick={() => setDraft(DEFAULT_INVENTORY_FILTERS)}>
            Reset
          </button>
          <button type="button" className="btn p fd-apply" onClick={() => onApply(draft)}>
            Show {matchCount} {matchCount === 1 ? 'item' : 'items'}
          </button>
        </>
      }
    >
      <FilterSection label="Stock level" htmlFor="inv-stock">
        <Dropdown id="inv-stock" value={draft.stock} options={STOCK_OPTIONS} onChange={(stock) => set({ stock })} />
      </FilterSection>

      <FilterSection label="Best-before date" htmlFor="inv-expiry">
        <Dropdown id="inv-expiry" value={draft.expiry} options={EXPIRY_OPTIONS} onChange={(expiry) => set({ expiry })} />
      </FilterSection>

      <FilterSection label="Category" htmlFor="inv-category">
        <Dropdown id="inv-category" value={draft.category} options={categoryOptions} onChange={(category) => set({ category })} />
      </FilterSection>

      <FilterSection label="Stock tracking" htmlFor="inv-tracking">
        <Dropdown id="inv-tracking" value={draft.tracking} options={INVENTORY_TRACKING_OPTIONS} onChange={(tracking) => set({ tracking })} />
      </FilterSection>
    </FilterDrawer>
  );
}
