import { useMemo, useState } from 'react';
import { Dropdown, MultiDropdown } from './Dropdown.js';
import { DateRangeSection, FilterDrawer, FilterSection } from './FilterDrawer.js';
import { CHANNEL_OPTIONS, SALES_POINT_OPTIONS, isCustomRangeInvalid } from '../lib/sale-filters.js';
import {
  DEFAULT_ORDER_FILTERS,
  ORDER_STATUS_OPTIONS,
  countActiveOrderFilters,
  filterOrders,
  searchOrders,
  type FilterableOrder,
  type OrderFilters,
  type SearchableOrder,
} from '../lib/order-filters.js';

interface OrderFilterDrawerProps {
  /** The filters in use when the drawer opened. Edits stay local until Show is pressed. */
  initial: OrderFilters;
  /** The search text on the page, so the count matches what Show will display. */
  search: string;
  orders: (FilterableOrder & SearchableOrder)[];
  onApply: (next: OrderFilters) => void;
  onClose: () => void;
}

// The Fulfilments filters: status, channel, sales point and date.
export function OrderFilterDrawer({ initial, search, orders, onApply, onClose }: OrderFilterDrawerProps) {
  const [draft, setDraft] = useState<OrderFilters>(initial);
  const matchCount = useMemo(() => searchOrders(filterOrders(orders, draft), search).length, [orders, draft, search]);
  const activeCount = countActiveOrderFilters(draft);
  const invalid = isCustomRangeInvalid(draft);

  function set(patch: Partial<OrderFilters>) {
    setDraft((d) => ({ ...d, ...patch }));
  }

  return (
    <FilterDrawer
      title="Filters"
      subtitle={activeCount === 0 ? 'Nothing applied' : `${activeCount} ${activeCount === 1 ? 'group' : 'groups'} applied`}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn fd-reset" disabled={activeCount === 0} onClick={() => setDraft(DEFAULT_ORDER_FILTERS)}>
            Reset
          </button>
          <button type="button" className="btn p fd-apply" disabled={invalid} onClick={() => onApply(draft)}>
            Show {matchCount} {matchCount === 1 ? 'order' : 'orders'}
          </button>
        </>
      }
    >
      <FilterSection label="Status" htmlFor="orders-status">
        <Dropdown id="orders-status" value={draft.status} options={ORDER_STATUS_OPTIONS} onChange={(status) => set({ status })} />
      </FilterSection>

      <FilterSection label="Channel">
        <MultiDropdown
          id="orders-channel"
          ariaLabel="Channel"
          values={draft.channels}
          options={CHANNEL_OPTIONS}
          placeholder="All channels"
          onChange={(channels) => set({ channels })}
        />
      </FilterSection>

      <FilterSection label="Sales point" htmlFor="orders-sales-point">
        <Dropdown id="orders-sales-point" value={draft.salesPoint} options={SALES_POINT_OPTIONS} onChange={(salesPoint) => set({ salesPoint })} />
      </FilterSection>

      <DateRangeSection idPrefix="orders" value={draft} onChange={set} />
    </FilterDrawer>
  );
}
