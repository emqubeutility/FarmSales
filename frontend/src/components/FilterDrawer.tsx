import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Dropdown } from './Dropdown.js';
import { DATE_PRESET_OPTIONS, dateRangeFor, describeRange, isCustomRangeInvalid, type DateFilter } from '../lib/sale-filters.js';

// The right-side drawer used by every list's Filters button. The page owns the filter values
// and passes the sections in as children. Each drawer holds a draft until its footer applies it.

const FOCUSABLE = 'button:not([disabled]), input:not([disabled]), select:not([disabled]), [href]';

interface FilterDrawerProps {
  title: string;
  subtitle: string;
  onClose: () => void;
  /** The footer buttons. */
  footer: ReactNode;
  children: ReactNode;
}

export function FilterDrawer({ title, subtitle, onClose, footer, children }: FilterDrawerProps) {
  const panelRef = useRef<HTMLElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    headingRef.current?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    // Escape closes. Tab stays inside the panel while it is open.
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (e.key !== 'Tab' || !panelRef.current) return;
      const items = Array.from(panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || !panelRef.current.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    }

    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose]);

  return createPortal(
    <div className="fd-root">
      <div className="fd-backdrop" onMouseDown={onClose} aria-hidden="true" />
      <aside ref={panelRef} className="fd-panel" role="dialog" aria-modal="true" aria-labelledby="fd-title">
        <header className="fd-head">
          <div>
            <h2 id="fd-title" ref={headingRef} tabIndex={-1} className="fd-heading">{title}</h2>
            <p className="fd-sub">{subtitle}</p>
          </div>
          <button type="button" className="fd-close" aria-label="Close filters" onClick={onClose}>
            <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="6" y1="6" x2="18" y2="18" />
              <line x1="18" y1="6" x2="6" y2="18" />
            </svg>
          </button>
        </header>
        <div className="fd-body">{children}</div>
        <footer className="fd-foot">{footer}</footer>
      </aside>
    </div>,
    document.body,
  );
}

/** One titled part of the drawer. Pass htmlFor to label a control, or leave it out for a group. */
export function FilterSection({ label, htmlFor, children }: { label: string; htmlFor?: string; children: ReactNode }) {
  return (
    <section className="fd-section">
      {htmlFor ? <label className="fd-title" htmlFor={htmlFor}>{label}</label> : <span className="fd-title">{label}</span>}
      {children}
    </section>
  );
}

/** The date preset dropdown, with From and To fields when Custom is chosen. */
export function DateRangeSection({
  idPrefix,
  value,
  onChange,
}: {
  idPrefix: string;
  value: DateFilter;
  onChange: (patch: Partial<DateFilter>) => void;
}) {
  const range = dateRangeFor(value.datePreset, value.customFrom, value.customTo);
  const customEmpty = value.datePreset === 'CUSTOM' && !value.customFrom && !value.customTo;
  const customInvalid = isCustomRangeInvalid(value);

  return (
    <FilterSection label="Date" htmlFor={`${idPrefix}-date`}>
      <Dropdown id={`${idPrefix}-date`} value={value.datePreset} options={DATE_PRESET_OPTIONS} onChange={(datePreset) => onChange({ datePreset })} />

      {value.datePreset === 'CUSTOM' && (
        <div className="fd-custom">
          <div>
            <label className="fd-label" htmlFor={`${idPrefix}-from`}>From</label>
            <input id={`${idPrefix}-from`} className="in" type="date" value={value.customFrom} max={value.customTo || undefined} onChange={(e) => onChange({ customFrom: e.target.value })} />
          </div>
          <div>
            <label className="fd-label" htmlFor={`${idPrefix}-to`}>To</label>
            <input id={`${idPrefix}-to`} className="in" type="date" value={value.customTo} min={value.customFrom || undefined} onChange={(e) => onChange({ customTo: e.target.value })} />
          </div>
        </div>
      )}

      {customInvalid ? (
        <p className="fd-error">“From” is after “To”, so nothing matches.</p>
      ) : customEmpty ? (
        <p className="fd-note">Pick a From date, a To date, or both.</p>
      ) : value.datePreset !== 'ALL' ? (
        <p className="fd-note">{describeRange(range)}</p>
      ) : null}
    </FilterSection>
  );
}
