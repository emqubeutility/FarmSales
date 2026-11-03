import { useMemo, useState } from 'react';

// Click cycle per column: ascending, descending, then back to the original order.
// Blank values always sort to the end, whichever direction is chosen.

export type SortValue = string | number | boolean | Date | null | undefined;
export type SortState = { key: string; dir: 'asc' | 'desc' } | null;

function compareValues(a: Exclude<SortValue, null | undefined>, b: Exclude<SortValue, null | undefined>): number {
  const av = a instanceof Date ? a.getTime() : typeof a === 'boolean' ? Number(a) : a;
  const bv = b instanceof Date ? b.getTime() : typeof b === 'boolean' ? Number(b) : b;
  if (typeof av === 'number' && typeof bv === 'number') return av - bv;
  return String(av).localeCompare(String(bv), undefined, { numeric: true, sensitivity: 'base' });
}

function isBlank(v: SortValue): boolean {
  return v === null || v === undefined || v === '';
}

export function useTableSort<T>(rows: T[], accessors: Record<string, (row: T) => SortValue>) {
  const [sort, setSort] = useState<SortState>(null);

  const sorted = useMemo(() => {
    if (!sort) return rows;
    const get = accessors[sort.key];
    if (!get) return rows;
    const direction = sort.dir === 'asc' ? 1 : -1;
    return [...rows].sort((x, y) => {
      const a = get(x);
      const b = get(y);
      if (isBlank(a) && isBlank(b)) return 0;
      if (isBlank(a)) return 1;
      if (isBlank(b)) return -1;
      return compareValues(a as Exclude<SortValue, null | undefined>, b as Exclude<SortValue, null | undefined>) * direction;
    });
  }, [rows, sort, accessors]);

  function toggle(key: string) {
    setSort((prev) => {
      if (!prev || prev.key !== key) return { key, dir: 'asc' };
      if (prev.dir === 'asc') return { key, dir: 'desc' };
      return null;
    });
  }

  return { rows: sorted, sort, toggle };
}

interface SortThProps {
  label: string;
  sortKey: string;
  sort: SortState;
  onSort: (key: string) => void;
  align?: 'r';
}

// A table header that sorts its column when clicked. Use it in place of a plain <th>.
export function SortTh({ label, sortKey, sort, onSort, align }: SortThProps) {
  const active = sort?.key === sortKey;
  const arrow = active ? (sort.dir === 'asc' ? '▲' : '▼') : '⇅';
  return (
    <th
      className={align === 'r' ? 'r' : undefined}
      aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
      style={{ whiteSpace: 'nowrap' }}
    >
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        title={`Sort by ${label}`}
        style={{
          all: 'unset',
          cursor: 'pointer',
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          font: 'inherit',
          color: 'inherit',
          textTransform: 'inherit',
          letterSpacing: 'inherit',
          fontWeight: 'inherit',
        }}
      >
        {label}
        <span aria-hidden="true" style={{ opacity: active ? 1 : 0.35, fontSize: 11 }}>{arrow}</span>
      </button>
    </th>
  );
}
