import { useMemo, useState } from 'react';
import { Dropdown, type DropdownOption } from './Dropdown.js';
import { FilterDrawer, FilterSection } from './FilterDrawer.js';
import {
  DEFAULT_ITEM_FILTERS,
  ITEM_STATUS_OPTIONS,
  TRACKING_OPTIONS,
  countActiveItemFilters,
  filterItems,
  type FilterableItem,
  type ItemFilters,
} from '../lib/item-filters.js';

interface ItemFilterDrawerProps {
  /** The filters in use when the drawer opened. Edits stay local until Show is pressed. */
  initial: ItemFilters;
  items: FilterableItem[];
  /** Category choices, including "No category". */
  categoryOptions: DropdownOption<string>[];
  /** Tax class choices, including "No tax class". */
  taxClassOptions: DropdownOption<string>[];
  onApply: (next: ItemFilters) => void;
  onClose: () => void;
}

// The Items filters: stock tracking, category, tax class and status.
export function ItemFilterDrawer({ initial, items, categoryOptions, taxClassOptions, onApply, onClose }: ItemFilterDrawerProps) {
  const [draft, setDraft] = useState<ItemFilters>(initial);
  const matchCount = useMemo(() => filterItems(items, draft).length, [items, draft]);
  const activeCount = countActiveItemFilters(draft);

  function set(patch: Partial<ItemFilters>) {
    setDraft((d) => ({ ...d, ...patch }));
  }

  return (
    <FilterDrawer
      title="Filters"
      subtitle={activeCount === 0 ? 'Nothing applied' : `${activeCount} ${activeCount === 1 ? 'group' : 'groups'} applied`}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn fd-reset" disabled={activeCount === 0} onClick={() => setDraft(DEFAULT_ITEM_FILTERS)}>
            Reset
          </button>
          <button type="button" className="btn p fd-apply" onClick={() => onApply(draft)}>
            Show {matchCount} {matchCount === 1 ? 'item' : 'items'}
          </button>
        </>
      }
    >
      <FilterSection label="Stock tracking" htmlFor="items-tracking">
        <Dropdown id="items-tracking" value={draft.tracking} options={TRACKING_OPTIONS} onChange={(tracking) => set({ tracking })} />
      </FilterSection>

      <FilterSection label="Category" htmlFor="items-category">
        <Dropdown id="items-category" value={draft.categoryId} options={categoryOptions} onChange={(categoryId) => set({ categoryId })} />
      </FilterSection>

      <FilterSection label="Tax class" htmlFor="items-tax-class">
        <Dropdown id="items-tax-class" value={draft.taxClassId} options={taxClassOptions} onChange={(taxClassId) => set({ taxClassId })} />
      </FilterSection>

      <FilterSection label="Status" htmlFor="items-status">
        <Dropdown id="items-status" value={draft.status} options={ITEM_STATUS_OPTIONS} onChange={(status) => set({ status })} />
      </FilterSection>
    </FilterDrawer>
  );
}
