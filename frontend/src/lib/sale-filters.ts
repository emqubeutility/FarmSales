import { formatDate } from './format.js';

// Search and filters for the Sales list. Pure functions, so the page only has to hold state.
// Dates are read in the browser's local time zone (IST for this business).

export type StatusFilter = 'ALL' | 'HELD' | 'FINALIZED' | 'VOID';
export type SalesPointFilter = 'ALL' | 'MARKET_STALL' | 'WAREHOUSE_COUNTER';
export type DatePreset = 'ALL' | 'WEEK_TD' | 'LAST_WEEK' | 'MONTH_TD' | 'LAST_MONTH' | 'QUARTER_TD' | 'YEAR_TD' | 'CUSTOM';

/** The date filter, shared by the sales and fulfilment lists. */
export interface DateFilter {
  datePreset: DatePreset;
  /** yyyy-mm-dd, used only when datePreset is CUSTOM. */
  customFrom: string;
  /** yyyy-mm-dd, inclusive. Used only when datePreset is CUSTOM. */
  customTo: string;
}

export interface SaleFilters extends DateFilter {
  search: string;
  status: StatusFilter;
  salesPoint: SalesPointFilter;
  /** Empty means every channel. */
  channels: string[];
}

export const DEFAULT_SALE_FILTERS: SaleFilters = {
  search: '',
  status: 'ALL',
  salesPoint: 'ALL',
  channels: [],
  datePreset: 'ALL',
  customFrom: '',
  customTo: '',
};

/** One removable chip. Removing it applies `patch` to the filters. */
export interface AppliedFilter<T> {
  key: string;
  label: string;
  patch: Partial<T>;
}

/** The fields the filters read from a bill. Sale objects satisfy this shape. */
export interface FilterableSale {
  number: string | null;
  status: 'HELD' | 'FINALIZED' | 'VOID';
  channel: string;
  salesPoint: string;
  createdAt: string;
  lines: { item: { name: string } }[];
}

export const CHANNEL_LABELS: Record<string, string> = {
  WALK_IN: 'Walk-in',
  PHONE: 'Phone',
  ONLINE: 'Online',
  EMAIL: 'Email',
  SOCIAL: 'Social',
};

export const SALES_POINT_LABELS: Record<string, string> = {
  MARKET_STALL: 'Market stall',
  WAREHOUSE_COUNTER: 'Warehouse counter',
};

export const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: 'ALL', label: 'All' },
  { value: 'HELD', label: 'Held' },
  { value: 'FINALIZED', label: 'Finalized' },
  { value: 'VOID', label: 'Void' },
];

export const SALES_POINT_OPTIONS: { value: SalesPointFilter; label: string }[] = [
  { value: 'ALL', label: 'All' },
  { value: 'MARKET_STALL', label: 'Market stall' },
  { value: 'WAREHOUSE_COUNTER', label: 'Warehouse counter' },
];

export const CHANNEL_OPTIONS: { value: string; label: string }[] = Object.entries(CHANNEL_LABELS).map(
  ([value, label]) => ({ value, label }),
);

export const DATE_PRESET_OPTIONS: { value: DatePreset; label: string }[] = [
  { value: 'ALL', label: 'All dates' },
  { value: 'WEEK_TD', label: 'Current Week Till Date' },
  { value: 'LAST_WEEK', label: 'Last Week' },
  { value: 'MONTH_TD', label: 'Current Month Till Date' },
  { value: 'LAST_MONTH', label: 'Last Month' },
  { value: 'QUARTER_TD', label: 'Current Quarter Till Date' },
  { value: 'YEAR_TD', label: 'Current Year Till Date' },
  { value: 'CUSTOM', label: 'Custom' },
];

/** start is inclusive, end is exclusive. A null bound is open. */
export interface DateRange {
  start: Date | null;
  end: Date | null;
}

// Parses yyyy-mm-dd as a local calendar day. Returns null for an empty or invalid value.
function parseLocalDay(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const [, y, m, d] = match.map(Number);
  const date = new Date(y, m - 1, d);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Resolves a date preset to a range. Weeks start on Monday. The financial year
 * starts on 1 April, so quarters and years follow the Indian FY.
 */
export function dateRangeFor(
  preset: DatePreset,
  customFrom: string,
  customTo: string,
  now: Date = new Date(),
): DateRange {
  const y = now.getFullYear();
  const m = now.getMonth();
  const d = now.getDate();
  // Days since Monday: Monday = 0 ... Sunday = 6.
  const sinceMonday = (now.getDay() + 6) % 7;
  // Months since the FY started (April = 0).
  const monthsIntoFy = (m - 3 + 12) % 12;
  const fyStartYear = m >= 3 ? y : y - 1;

  switch (preset) {
    case 'WEEK_TD':
      return { start: new Date(y, m, d - sinceMonday), end: null };
    case 'LAST_WEEK': {
      const thisMonday = d - sinceMonday;
      return { start: new Date(y, m, thisMonday - 7), end: new Date(y, m, thisMonday) };
    }
    case 'MONTH_TD':
      return { start: new Date(y, m, 1), end: null };
    case 'LAST_MONTH':
      return { start: new Date(y, m - 1, 1), end: new Date(y, m, 1) };
    case 'QUARTER_TD':
      return { start: new Date(y, m - (monthsIntoFy % 3), 1), end: null };
    case 'YEAR_TD':
      return { start: new Date(fyStartYear, 3, 1), end: null };
    case 'CUSTOM': {
      const from = parseLocalDay(customFrom);
      const to = parseLocalDay(customTo);
      return {
        start: from,
        end: to ? new Date(to.getFullYear(), to.getMonth(), to.getDate() + 1) : null,
      };
    }
    case 'ALL':
    default:
      return { start: null, end: null };
  }
}

/** A range written for people, e.g. "02 Nov 2026 to today". */
export function describeRange(range: DateRange): string {
  const first = range.start ? formatDate(range.start) : 'the beginning';
  // The end is exclusive, so the last day shown is one millisecond before it.
  const last = range.end ? formatDate(new Date(range.end.getTime() - 1)) : 'today';
  return `${first} to ${last}`;
}

/**
 * Whether a timestamp falls inside the range. An open range matches everything. A bounded
 * range rejects a missing timestamp.
 */
export function matchesDateRange(createdAt: string | undefined, range: DateRange): boolean {
  if (!range.start && !range.end) return true;
  if (!createdAt) return false;
  const time = new Date(createdAt).getTime();
  if (range.start && time < range.start.getTime()) return false;
  if (range.end && time >= range.end.getTime()) return false;
  return true;
}

/** True when the custom dates are in the wrong order, so the drawer should not apply them. */
export function isCustomRangeInvalid(value: DateFilter): boolean {
  return value.datePreset === 'CUSTOM' && !!value.customFrom && !!value.customTo && value.customFrom > value.customTo;
}

/** The date chip shown in the applied-filter row, or null when no date filter is set. */
export function describeDateFilter(filter: DateFilter, now: Date = new Date()): AppliedFilter<DateFilter> | null {
  if (filter.datePreset === 'ALL') return null;
  const range = dateRangeFor(filter.datePreset, filter.customFrom, filter.customTo, now);
  const customEmpty = filter.datePreset === 'CUSTOM' && !range.start && !range.end;
  const presetLabel = DATE_PRESET_OPTIONS.find((o) => o.value === filter.datePreset)?.label ?? '';
  return {
    key: 'date',
    label: filter.datePreset === 'CUSTOM' && !customEmpty ? `Date: ${describeRange(range)}` : `Date: ${presetLabel}`,
    patch: { datePreset: 'ALL', customFrom: '', customTo: '' },
  };
}

function matchesSearch(sale: FilterableSale, term: string): boolean {
  const fields = [
    sale.number ?? '',
    CHANNEL_LABELS[sale.channel] ?? sale.channel,
    SALES_POINT_LABELS[sale.salesPoint] ?? sale.salesPoint,
    ...sale.lines.map((line) => line.item.name),
  ];
  return fields.some((value) => value.toLowerCase().includes(term));
}

/** Applies every filter. A custom range with "from" after "to" matches nothing. */
export function filterSales<T extends FilterableSale>(sales: T[], filters: SaleFilters, now: Date = new Date()): T[] {
  const range = dateRangeFor(filters.datePreset, filters.customFrom, filters.customTo, now);
  const term = filters.search.trim().toLowerCase();

  return sales.filter((sale) => {
    if (filters.status !== 'ALL' && sale.status !== filters.status) return false;
    if (filters.salesPoint !== 'ALL' && sale.salesPoint !== filters.salesPoint) return false;
    if (filters.channels.length > 0 && !filters.channels.includes(sale.channel)) return false;
    if (!matchesDateRange(sale.createdAt, range)) return false;
    if (term && !matchesSearch(sale, term)) return false;
    return true;
  });
}

/** The chips for every filter in use. */
export function describeSaleFilters(filters: SaleFilters, now: Date = new Date()): AppliedFilter<SaleFilters>[] {
  const chips: AppliedFilter<SaleFilters>[] = [];
  if (filters.status !== 'ALL') {
    const label = STATUS_OPTIONS.find((o) => o.value === filters.status)?.label ?? filters.status;
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

/** How many filter groups are set. Search is not counted: it has its own box. */
export function countActiveFilters(filters: SaleFilters): number {
  return [
    filters.status !== 'ALL',
    filters.salesPoint !== 'ALL',
    filters.channels.length > 0,
    filters.datePreset !== 'ALL',
  ].filter(Boolean).length;
}
