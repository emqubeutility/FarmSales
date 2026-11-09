import { useMemo, useState } from 'react';
import { MultiDropdown, Dropdown } from './Dropdown.js';
import { DateRangeSection, FilterDrawer, FilterSection } from './FilterDrawer.js';
import {
  CHANNEL_OPTIONS,
  DEFAULT_SALE_FILTERS,
  SALES_POINT_OPTIONS,
  STATUS_OPTIONS,
  countActiveFilters,
  filterSales,
  isCustomRangeInvalid,
  type FilterableSale,
  type SaleFilters,
} from '../lib/sale-filters.js';

interface SalesFilterDrawerProps {
  /** The filters in use when the drawer opened. Edits stay local until Show is pressed. */
  initial: SaleFilters;
  sales: FilterableSale[];
  onApply: (next: SaleFilters) => void;
  onClose: () => void;
}

// The Sales filters: status, channel, sales point and date.
export function SalesFilterDrawer({ initial, sales, onApply, onClose }: SalesFilterDrawerProps) {
  const [draft, setDraft] = useState<SaleFilters>(initial);
  const matchCount = useMemo(() => filterSales(sales, draft).length, [sales, draft]);
  const activeCount = countActiveFilters(draft);
  const invalid = isCustomRangeInvalid(draft);

  function set(patch: Partial<SaleFilters>) {
    setDraft((d) => ({ ...d, ...patch }));
  }

  return (
    <FilterDrawer
      title="Filters"
      subtitle={activeCount === 0 ? 'Nothing applied' : `${activeCount} ${activeCount === 1 ? 'group' : 'groups'} applied`}
      onClose={onClose}
      footer={
        <>
          <button
            type="button"
            className="btn fd-reset"
            disabled={activeCount === 0}
            onClick={() => setDraft({ ...DEFAULT_SALE_FILTERS, search: draft.search })}
          >
            Reset
          </button>
          <button type="button" className="btn p fd-apply" disabled={invalid} onClick={() => onApply(draft)}>
            Show {matchCount} {matchCount === 1 ? 'bill' : 'bills'}
          </button>
        </>
      }
    >
      <DateRangeSection idPrefix="sales" value={draft} onChange={set} />

      <FilterSection label="Status" htmlFor="sales-status">
        <Dropdown id="sales-status" value={draft.status} options={STATUS_OPTIONS} onChange={(status) => set({ status })} />
      </FilterSection>

      <FilterSection label="Channel">
        <MultiDropdown
          id="sales-channel"
          ariaLabel="Channel"
          values={draft.channels}
          options={CHANNEL_OPTIONS}
          placeholder="All channels"
          onChange={(channels) => set({ channels })}
        />
      </FilterSection>

      <FilterSection label="Sales point" htmlFor="sales-point">
        <Dropdown id="sales-point" value={draft.salesPoint} options={SALES_POINT_OPTIONS} onChange={(salesPoint) => set({ salesPoint })} />
      </FilterSection>
    </FilterDrawer>
  );
}
