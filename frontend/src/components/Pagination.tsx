import { useState } from 'react';

// Pagination for every list table. It sits at the bottom of the table, centred: the page numbers,
// and the rows-per-page choice of 25, 50 or 100. No row counts are shown.

export const PAGE_SIZES = [25, 50, 100] as const;

export interface PagingState {
  page: number;
  pageCount: number;
  pageSize: number;
  onPage: (page: number) => void;
  onPageSize: (size: number) => void;
}

// Splits a list into pages. Filters or search can shrink the list, so the page is kept in range.
export function usePaging<T>(rows: T[], defaultSize: number = PAGE_SIZES[0]): { pageRows: T[]; paging: PagingState } {
  const [pageSize, setPageSize] = useState<number>(defaultSize);
  const [requestedPage, setPage] = useState(1);
  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  const page = Math.min(requestedPage, pageCount);
  const pageRows = rows.slice((page - 1) * pageSize, page * pageSize);
  return {
    pageRows,
    paging: {
      page,
      pageCount,
      pageSize,
      onPage: setPage,
      onPageSize: (size) => {
        setPageSize(size);
        setPage(1);
      },
    },
  };
}

// The page buttons and the rows-per-page choice, centred under the table.
export function TablePagination({ page, pageCount, pageSize, onPage, onPageSize }: PagingState) {
  const pages = Array.from({ length: pageCount }, (_, i) => i + 1).filter(
    (n) => n === 1 || n === pageCount || Math.abs(n - page) <= 1,
  );
  return (
    <div
      className="pos-pagination"
      style={{ flex: 'none', display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', gap: 16, padding: '12px 16px', borderTop: '1px solid var(--border-light)', background: '#FAFBF9' }}
    >
      <div className="pos-page-controls">
        <button type="button" className="pos-page-button" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Previous page">‹</button>
        {pages.map((n, index) => (
          <span key={n} style={{ display: 'contents' }}>
            {index > 0 && pages[index - 1] !== n - 1 && <span className="pos-page-ellipsis">…</span>}
            <button type="button" className={`pos-page-button${n === page ? ' active' : ''}`} aria-current={n === page ? 'page' : undefined} onClick={() => onPage(n)}>
              {n}
            </button>
          </span>
        ))}
        <button type="button" className="pos-page-button" disabled={page >= pageCount} onClick={() => onPage(page + 1)} aria-label="Next page">›</button>
      </div>
      <label className="pos-page-size-label">
        Rows per page
        <select className="in pos-page-size" value={pageSize} onChange={(e) => onPageSize(Number(e.target.value))}>
          {PAGE_SIZES.map((size) => (
            <option key={size} value={size}>{size}</option>
          ))}
        </select>
      </label>
    </div>
  );
}
