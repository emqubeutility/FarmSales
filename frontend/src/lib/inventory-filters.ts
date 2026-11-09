// Search and filters for the Inventory list. Everything runs on the stock already loaded.

import type { AppliedFilter } from './sale-filters.js';

export type StockFilter = 'ALL' | 'IN_STOCK' | 'LOW' | 'OUT';
export type ExpiryFilter = 'ALL' | 'EXPIRED' | 'EXPIRING_30';
export type TrackingFilter = 'all' | 'tracked' | 'untracked';

/** Stands for "no category" in the category dropdown. */
export const NO_CATEGORY = '__none__';

export interface InventoryFilters {
  stock: StockFilter;
  expiry: ExpiryFilter;
  /** A category name, NO_CATEGORY, or '' for every category. */
  category: string;
  tracking: TrackingFilter;
}

export const DEFAULT_INVENTORY_FILTERS: InventoryFilters = {
  stock: 'ALL',
  expiry: 'ALL',
  category: '',
  tracking: 'all',
};

export const STOCK_OPTIONS: { value: StockFilter; label: string }[] = [
  { value: 'ALL', label: 'All stock' },
  { value: 'IN_STOCK', label: 'In stock' },
  { value: 'LOW', label: 'Low (at or below reorder level)' },
  { value: 'OUT', label: 'Out of stock' },
];

export const EXPIRY_OPTIONS: { value: ExpiryFilter; label: string }[] = [
  { value: 'ALL', label: 'Any best-before date' },
  { value: 'EXPIRING_30', label: 'Expiring in 30 days' },
  { value: 'EXPIRED', label: 'Expired' },
];

export const INVENTORY_TRACKING_OPTIONS: { value: TrackingFilter; label: string }[] = [
  { value: 'all', label: 'All items' },
  { value: 'tracked', label: 'Batch tracked' },
  { value: 'untracked', label: 'No batch' },
];

interface FilterableBatch {
  code: string;
  bestBefore: string | null;
  qty: string;
  supplier: { name: string } | null;
}

/** The fields the filters and search read from an inventory row. */
export interface FilterableInventoryItem {
  name: string;
  code: string;
  size: string | null;
  category: { name: string } | null;
  reorderLevel: number | null;
  trackBatches: boolean;
  totalQty: string;
  batches: FilterableBatch[];
}

const DAY_MS = 24 * 60 * 60 * 1000;

// Whether any batch on hand has a best-before date in the window [from, to).
function hasBatchBefore(item: FilterableInventoryItem, from: number, to: number): boolean {
  return item.batches.some((b) => {
    if (!(Number(b.qty) > 0)) return false;
    if (!b.bestBefore) return false;
    const time = new Date(b.bestBefore).getTime();
    return !Number.isNaN(time) && time >= from && time < to;
  });
}

/** Keeps the rows that match the search text and every filter. */
export function filterInventory<T extends FilterableInventoryItem>(
  items: T[],
  filters: InventoryFilters,
  search: string,
  now: Date = new Date(),
): T[] {
  const term = search.trim().toLowerCase();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const in30 = today + 30 * DAY_MS;

  return items.filter((item) => {
    const qty = Number(item.totalQty);
    if (filters.stock === 'IN_STOCK' && !(qty > 0)) return false;
    if (filters.stock === 'OUT' && qty > 0) return false;
    if (filters.stock === 'LOW' && !(item.reorderLevel !== null && qty <= item.reorderLevel)) return false;

    if (filters.expiry === 'EXPIRED' && !hasBatchBefore(item, Number.NEGATIVE_INFINITY, today)) return false;
    if (filters.expiry === 'EXPIRING_30' && !hasBatchBefore(item, today, in30)) return false;

    if (filters.category === NO_CATEGORY && item.category) return false;
    if (filters.category && filters.category !== NO_CATEGORY && item.category?.name !== filters.category) return false;

    if (filters.tracking !== 'all' && item.trackBatches !== (filters.tracking === 'tracked')) return false;

    if (term) {
      const fields = [
        item.name,
        item.code,
        item.size ?? '',
        item.category?.name ?? '',
        ...item.batches.flatMap((b) => [b.code, b.supplier?.name ?? '']),
      ];
      if (!fields.some((value) => value.toLowerCase().includes(term))) return false;
    }
    return true;
  });
}

/** The chips for every filter in use. */
export function describeInventoryFilters(filters: InventoryFilters): AppliedFilter<InventoryFilters>[] {
  const chips: AppliedFilter<InventoryFilters>[] = [];
  if (filters.stock !== 'ALL') {
    const label = STOCK_OPTIONS.find((o) => o.value === filters.stock)?.label ?? filters.stock;
    chips.push({ key: 'stock', label: `Stock: ${label}`, patch: { stock: 'ALL' } });
  }
  if (filters.expiry !== 'ALL') {
    const label = EXPIRY_OPTIONS.find((o) => o.value === filters.expiry)?.label ?? filters.expiry;
    chips.push({ key: 'expiry', label: `Expiry: ${label}`, patch: { expiry: 'ALL' } });
  }
  if (filters.category) {
    chips.push({
      key: 'category',
      label: `Category: ${filters.category === NO_CATEGORY ? 'None' : filters.category}`,
      patch: { category: '' },
    });
  }
  if (filters.tracking !== 'all') {
    const label = INVENTORY_TRACKING_OPTIONS.find((o) => o.value === filters.tracking)?.label ?? filters.tracking;
    chips.push({ key: 'tracking', label: `Tracking: ${label}`, patch: { tracking: 'all' } });
  }
  return chips;
}

/** How many filter groups are set. Search is not counted. */
export function countActiveInventoryFilters(filters: InventoryFilters): number {
  return [filters.stock !== 'ALL', filters.expiry !== 'ALL', filters.category !== '', filters.tracking !== 'all'].filter(Boolean).length;
}
