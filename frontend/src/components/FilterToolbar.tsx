import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';

// The search box and Filters button (FilterControls), and the count and applied-filter row
// under them (FilterSummary). A list can put the controls in its page header and the summary
// in its card, or use FilterToolbar for both in one place.

export interface ToolbarChip {
  key: string;
  label: string;
  onRemove: () => void;
}

interface FilterControlsProps {
  search: string;
  onSearch: (value: string) => void;
  searchLabel: string;
  searchPlaceholder: string;
  /** Number of filter groups in use. Shown on the button as a badge. */
  activeCount: number;
  /** Builds the drawer. It receives close(), which also returns focus to the Filters button. */
  renderDrawer: (close: () => void) => ReactNode;
  /** Gives the search box a fixed width, for use beside a page title. */
  compactSearch?: boolean;
  /** Shown after the Filters button, e.g. a primary button. */
  actions?: ReactNode;
}

// The search box and the Filters button. Opening the button shows the drawer.
export function FilterControls({
  search,
  onSearch,
  searchLabel,
  searchPlaceholder,
  activeCount,
  renderDrawer,
  compactSearch,
  actions,
}: FilterControlsProps) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Stable, so the drawer's keyboard setup does not re-run on every render.
  const close = useCallback(() => setOpen(false), []);

  // When the drawer closes, focus goes back to the Filters button.
  const wasOpen = useRef(false);
  useEffect(() => {
    if (open) {
      wasOpen.current = true;
    } else if (wasOpen.current) {
      wasOpen.current = false;
      buttonRef.current?.focus();
    }
  }, [open]);

  return (
    <>
      <div className="ft-controls">
        <label className={`ft-search${compactSearch ? ' is-compact' : ''}`}>
          <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="7" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            className="in"
            type="search"
            placeholder={searchPlaceholder}
            aria-label={searchLabel}
            value={search}
            onChange={(e) => onSearch(e.target.value)}
          />
        </label>
        <button
          ref={buttonRef}
          type="button"
          className={`btn ft-filter-btn${activeCount > 0 ? ' is-active' : ''}`}
          aria-haspopup="dialog"
          aria-expanded={open}
          onClick={() => setOpen(true)}
        >
          <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="4" y1="6" x2="20" y2="6" />
            <line x1="7" y1="12" x2="17" y2="12" />
            <line x1="10" y1="18" x2="14" y2="18" />
          </svg>
          Filters
          {activeCount > 0 && <span className="ft-badge">{activeCount}</span>}
        </button>
        {actions}
      </div>
      {open && renderDrawer(close)}
    </>
  );
}

interface FilterSummaryProps {
  activeCount: number;
  chips: ToolbarChip[];
  onClearAll: () => void;
  /** Rows left after filtering, and rows loaded in total. */
  shown: number;
  total: number;
  /** What the rows are, for the count, e.g. "bills" or "orders". */
  noun: string;
}

// The count, the applied-filter chips, and a clear link.
export function FilterSummary({ activeCount, chips, onClearAll, shown, total, noun }: FilterSummaryProps) {
  return (
    <div className="ft-summary">
      <span className="ft-count-text" aria-live="polite">
        {shown === total ? `${total} ${noun}` : `${shown} of ${total} ${noun}`}
      </span>
      {chips.map((chip) => (
        <button key={chip.key} type="button" className="ft-applied" onClick={chip.onRemove} aria-label={`Remove filter ${chip.label}`}>
          {chip.label}
          <span aria-hidden="true" className="ft-x">×</span>
        </button>
      ))}
      {activeCount > 0 && (
        <button type="button" className="ft-clear" onClick={onClearAll}>
          Clear filters
        </button>
      )}
    </div>
  );
}

interface FilterToolbarProps extends Omit<FilterControlsProps, 'compactSearch'> {
  chips: ToolbarChip[];
  onClearAll: () => void;
  shown: number;
  total: number;
  noun: string;
  /** Shown first on the toolbar row, e.g. the page title. */
  leading?: ReactNode;
}

// Controls and summary together, inside a card. Use leading for a title on the same row.
export function FilterToolbar({ leading, chips, onClearAll, shown, total, noun, ...controls }: FilterToolbarProps) {
  return (
    <div className="ft-bar">
      <div className="ft-toolbar">
        {leading && <div className="ft-title">{leading}</div>}
        {leading && <div className="ft-spacer" />}
        <FilterControls {...controls} compactSearch={!!leading} />
      </div>
      <FilterSummary
        activeCount={controls.activeCount}
        chips={chips}
        onClearAll={onClearAll}
        shown={shown}
        total={total}
        noun={noun}
      />
    </div>
  );
}
