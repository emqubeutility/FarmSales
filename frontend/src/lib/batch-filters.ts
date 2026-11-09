// Filters for the Batches list. The search box goes to the server; these filter the batches it returns.

import { isExpired } from '@farm-sales/shared';
import type { AppliedFilter } from './sale-filters.js';

export type BatchStatusFilter = 'ALL' | 'ACTIVE' | 'HOLD';
export type BatchExpiryFilter = 'ALL' | 'EXPIRED' | 'EXPIRING_30';
export type BatchStockFilter = 'ALL' | 'IN_STOCK' | 'EMPTY';

/** Stands for "no supplier" in the supplier dropdown. */
export const NO_SUPPLIER = '__none__';

export interface BatchFilters {
  status: BatchStatusFilter;
  expiry: BatchExpiryFilter;
  /** A supplier name, NO_SUPPLIER, or '' for every supplier. */
  supplier: string;
  stock: BatchStockFilter;
}

export const DEFAULT_BATCH_FILTERS: BatchFilters = {
  status: 'ALL',
  expiry: 'ALL',
  supplier: '',
  stock: 'ALL',
};

export const BATCH_STATUS_OPTIONS: { value: BatchStatusFilter; label: string }[] = [
  { value: 'ALL', label: 'All batches' },
  { value: 'ACTIVE', label: 'Active' },
  { value: 'HOLD', label: 'On hold' },
];

export const BATCH_EXPIRY_OPTIONS: { value: BatchExpiryFilter; label: string }[] = [
  { value: 'ALL', label: 'Any best-before date' },
  { value: 'EXPIRING_30', label: 'Expiring in 30 days' },
  { value: 'EXPIRED', label: 'Expired' },
];

export const BATCH_STOCK_OPTIONS: { value: BatchStockFilter; label: string }[] = [
  { value: 'ALL', label: 'Any stock level' },
  { value: 'IN_STOCK', label: 'Has stock on hand' },
  { value: 'EMPTY', label: 'Empty (nothing on hand)' },
];

/** The fields the filters read from a batch row. */
export interface FilterableBatch {
  status: 'ACTIVE' | 'HOLD';
  bestBefore: string | null;
  supplier: { name: string } | null;
  stockBalances: { qty: string }[];
}

const DAY_MS = 24 * 60 * 60 * 1000;

function onHand(batch: FilterableBatch): number {
  return Number(batch.stockBalances[0]?.qty ?? 0);
}

// Whether the batch expires within the next 30 days. Expired batches are not counted here.
function expiringWithin30(bestBefore: string | null, now: Date): boolean {
  if (!bestBefore || isExpired(bestBefore, now)) return false;
  const bb = new Date(bestBefore);
  const bbDay = new Date(bb.getFullYear(), bb.getMonth(), bb.getDate()).getTime();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return bbDay - today <= 30 * DAY_MS;
}

/** Keeps the batches that match every filter. */
export function filterBatches<T extends FilterableBatch>(batches: T[], filters: BatchFilters, now: Date = new Date()): T[] {
  return batches.filter((batch) => {
    if (filters.status !== 'ALL' && batch.status !== filters.status) return false;
    if (filters.expiry === 'EXPIRED' && !isExpired(batch.bestBefore, now)) return false;
    if (filters.expiry === 'EXPIRING_30' && !expiringWithin30(batch.bestBefore, now)) return false;
    if (filters.supplier === NO_SUPPLIER && batch.supplier) return false;
    if (filters.supplier && filters.supplier !== NO_SUPPLIER && batch.supplier?.name !== filters.supplier) return false;
    if (filters.stock === 'IN_STOCK' && !(onHand(batch) > 0)) return false;
    if (filters.stock === 'EMPTY' && onHand(batch) > 0) return false;
    return true;
  });
}

/** The chips for every filter in use. */
export function describeBatchFilters(filters: BatchFilters): AppliedFilter<BatchFilters>[] {
  const chips: AppliedFilter<BatchFilters>[] = [];
  if (filters.status !== 'ALL') {
    const label = BATCH_STATUS_OPTIONS.find((o) => o.value === filters.status)?.label ?? filters.status;
    chips.push({ key: 'status', label: `Status: ${label}`, patch: { status: 'ALL' } });
  }
  if (filters.expiry !== 'ALL') {
    const label = BATCH_EXPIRY_OPTIONS.find((o) => o.value === filters.expiry)?.label ?? filters.expiry;
    chips.push({ key: 'expiry', label: `Best before: ${label}`, patch: { expiry: 'ALL' } });
  }
  if (filters.supplier) {
    chips.push({
      key: 'supplier',
      label: `Supplier: ${filters.supplier === NO_SUPPLIER ? 'None' : filters.supplier}`,
      patch: { supplier: '' },
    });
  }
  if (filters.stock !== 'ALL') {
    const label = BATCH_STOCK_OPTIONS.find((o) => o.value === filters.stock)?.label ?? filters.stock;
    chips.push({ key: 'stock', label: `Stock: ${label}`, patch: { stock: 'ALL' } });
  }
  return chips;
}

/** How many filter groups are set. Search is not counted. */
export function countActiveBatchFilters(filters: BatchFilters): number {
  return [filters.status !== 'ALL', filters.expiry !== 'ALL', filters.supplier !== '', filters.stock !== 'ALL'].filter(Boolean).length;
}
