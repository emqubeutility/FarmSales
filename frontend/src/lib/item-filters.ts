// Filters for the Items list. The search box stays on the server; these filter what it returns.

export type TrackingFilter = 'all' | 'tracked' | 'untracked';
export type ItemStatusFilter = 'ALL' | 'ACTIVE' | 'INACTIVE';

/** Stands for "no category" or "no tax class" in the dropdowns. */
export const NONE_VALUE = '__none__';

export interface ItemFilters {
  tracking: TrackingFilter;
  /** An id, NONE_VALUE, or '' for every category. */
  categoryId: string;
  /** An id, NONE_VALUE, or '' for every tax class. */
  taxClassId: string;
  status: ItemStatusFilter;
}

export const DEFAULT_ITEM_FILTERS: ItemFilters = {
  tracking: 'all',
  categoryId: '',
  taxClassId: '',
  status: 'ALL',
};

export const TRACKING_OPTIONS: { value: TrackingFilter; label: string }[] = [
  { value: 'all', label: 'All items' },
  { value: 'tracked', label: 'Batch tracked' },
  { value: 'untracked', label: 'No batch' },
];

export const ITEM_STATUS_OPTIONS: { value: ItemStatusFilter; label: string }[] = [
  { value: 'ALL', label: 'All items' },
  { value: 'ACTIVE', label: 'Active' },
  { value: 'INACTIVE', label: 'Inactive' },
];

/** The fields the filters read from an item. */
export interface FilterableItem {
  trackBatches: boolean;
  categoryId: string | null;
  taxClassId: string | null;
  active: boolean;
}

/** Keeps the items that match every filter in use. */
export function filterItems<T extends FilterableItem>(items: T[], filters: ItemFilters): T[] {
  return items.filter((item) => {
    if (filters.tracking !== 'all' && item.trackBatches !== (filters.tracking === 'tracked')) return false;
    if (filters.categoryId && (item.categoryId ?? NONE_VALUE) !== filters.categoryId) return false;
    if (filters.taxClassId && (item.taxClassId ?? NONE_VALUE) !== filters.taxClassId) return false;
    if (filters.status !== 'ALL' && item.active !== (filters.status === 'ACTIVE')) return false;
    return true;
  });
}

/** How many filter groups are set. Tracking counts too, since it has its own tabs and the drawer. */
export function countActiveItemFilters(filters: ItemFilters): number {
  return [
    filters.tracking !== 'all',
    filters.categoryId !== '',
    filters.taxClassId !== '',
    filters.status !== 'ALL',
  ].filter(Boolean).length;
}
