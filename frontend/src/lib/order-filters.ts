import {
  CHANNEL_LABELS,
  SALES_POINT_OPTIONS,
  dateRangeFor,
  describeDateFilter,
  matchesDateRange,
  type AppliedFilter,
  type DateFilter,
  type SalesPointFilter,
} from './sale-filters.js';

// Filters for the Fulfilments (orders) list. Search stays a separate box on the page.

export type OrderStatusValue = 'NEW' | 'PACKED' | 'DISPATCHED' | 'DELIVERED' | 'CANCELLED';
export type OrderStatusFilter = 'ALL' | OrderStatusValue;

export interface OrderFilters extends DateFilter {
  status: OrderStatusFilter;
  salesPoint: SalesPointFilter;
  /** Empty means every channel. */
  channels: string[];
}

export const DEFAULT_ORDER_FILTERS: OrderFilters = {
  status: 'ALL',
  salesPoint: 'ALL',
  channels: [],
  datePreset: 'ALL',
  customFrom: '',
  customTo: '',
};

export const ORDER_STATUS_OPTIONS: { value: OrderStatusFilter; label: string }[] = [
  { value: 'ALL', label: 'All orders' },
  { value: 'NEW', label: 'New' },
  { value: 'PACKED', label: 'Packed' },
  { value: 'DISPATCHED', label: 'Out for delivery' },
  { value: 'DELIVERED', label: 'Delivered' },
  { value: 'CANCELLED', label: 'Cancelled' },
];

/** The fields the filters read from an order. */
export interface FilterableOrder {
  status: OrderStatusValue;
  channel: string;
  salesPoint: string;
  createdAt?: string;
}

/** The fields the search box matches: order code, customer name and phone, and channel. */
export interface SearchableOrder {
  code: string;
  customerName: string;
  customerPhone?: string | null;
  channel: string;
}

/** Keeps the orders whose code, customer, phone or channel contains the search text. */
export function searchOrders<T extends SearchableOrder>(orders: T[], search: string): T[] {
  const term = search.trim().toLowerCase();
  if (!term) return orders;
  return orders.filter((order) =>
    [order.code, order.customerName, order.customerPhone ?? '', CHANNEL_LABELS[order.channel] ?? order.channel]
      .some((value) => value.toLowerCase().includes(term)),
  );
}

/** Applies status, channel, sales point and date. */
export function filterOrders<T extends FilterableOrder>(orders: T[], filters: OrderFilters, now: Date = new Date()): T[] {
  const range = dateRangeFor(filters.datePreset, filters.customFrom, filters.customTo, now);
  return orders.filter((order) => {
    if (filters.status !== 'ALL' && order.status !== filters.status) return false;
    if (filters.salesPoint !== 'ALL' && order.salesPoint !== filters.salesPoint) return false;
    if (filters.channels.length > 0 && !filters.channels.includes(order.channel)) return false;
    return matchesDateRange(order.createdAt, range);
  });
}

/** The chips for every filter in use. */
export function describeOrderFilters(filters: OrderFilters, now: Date = new Date()): AppliedFilter<OrderFilters>[] {
  const chips: AppliedFilter<OrderFilters>[] = [];
  if (filters.status !== 'ALL') {
    const label = ORDER_STATUS_OPTIONS.find((o) => o.value === filters.status)?.label ?? filters.status;
    chips.push({ key: 'status', label: `Status: ${label}`, patch: { status: 'ALL' } });
  }
  if (filters.salesPoint !== 'ALL') {
    const label = SALES_POINT_OPTIONS.find((o) => o.value === filters.salesPoint)?.label ?? filters.salesPoint;
    chips.push({ key: 'salesPoint', label: `Sales point: ${label}`, patch: { salesPoint: 'ALL' } });
  }
  for (const channel of filters.channels) {
    chips.push({
      key: `channel-${channel}`,
      label: `Channel: ${CHANNEL_LABELS[channel] ?? channel}`,
      patch: { channels: filters.channels.filter((c) => c !== channel) },
    });
  }
  const date = describeDateFilter(filters, now);
  if (date) chips.push(date);
  return chips;
}

/** How many filter groups are set. Search is not counted. */
export function countActiveOrderFilters(filters: OrderFilters): number {
  return [
    filters.status !== 'ALL',
    filters.salesPoint !== 'ALL',
    filters.channels.length > 0,
    filters.datePreset !== 'ALL',
  ].filter(Boolean).length;
}
