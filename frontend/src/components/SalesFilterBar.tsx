import { FilterToolbar } from './FilterToolbar.js';
import { SalesFilterDrawer } from './SalesFilterDrawer.js';
import {
  DEFAULT_SALE_FILTERS,
  countActiveFilters,
  describeSaleFilters,
  type FilterableSale,
  type SaleFilters,
} from '../lib/sale-filters.js';

interface SalesFilterBarProps {
  filters: SaleFilters;
  onChange: (next: SaleFilters) => void;
  /** Every loaded bill. The drawer counts matches against these. */
  sales: FilterableSale[];
  /** Bills left after filtering. */
  shown: number;
  /** Bills loaded in total. */
  total: number;
}

// The Sales search, Filters button and drawer.
export function SalesFilterBar({ filters, onChange, sales, shown, total }: SalesFilterBarProps) {
  return (
    <FilterToolbar
      search={filters.search}
      onSearch={(search) => onChange({ ...filters, search })}
      searchLabel="Search bills"
      searchPlaceholder="Search bill number, item or channel"
      activeCount={countActiveFilters(filters)}
      chips={describeSaleFilters(filters).map((chip) => ({
        key: chip.key,
        label: chip.label,
        onRemove: () => onChange({ ...filters, ...chip.patch }),
      }))}
      onClearAll={() => onChange({ ...DEFAULT_SALE_FILTERS, search: filters.search })}
      shown={shown}
      total={total}
      noun="bills"
      renderDrawer={(close) => (
        <SalesFilterDrawer
          initial={filters}
          sales={sales}
          onClose={close}
          onApply={(next) => {
            onChange(next);
            close();
          }}
        />
      )}
    />
  );
}
