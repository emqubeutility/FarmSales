import { useEffect, useId, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

// Small building blocks shared by the admin pages (Customers, Users, Settings), so they look and
// behave the same way.

// A form field: label, the control, then either the error or a hint.
export function Field({
  label,
  required,
  error,
  hint,
  children,
  style,
}: {
  label: string;
  required?: boolean;
  error?: string;
  hint?: string;
  children: (ids: { id: string; invalid: boolean }) => ReactNode;
  style?: CSSProperties;
}) {
  const id = useId();
  return (
    <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, ...style }}>
      <label htmlFor={id} className="lbl">
        {label}
        {required && <span style={{ color: '#B42318' }}> *</span>}
      </label>
      {children({ id, invalid: !!error })}
      {error ? <div role="alert" className="field-error">{error}</div> : hint ? <div className="field-hint">{hint}</div> : null}
    </div>
  );
}

// A notice line for success or failure. Red for errors, green for saved.
export function Notice({ kind, children }: { kind: 'error' | 'success' | 'info'; children: ReactNode }) {
  const styles: Record<typeof kind, CSSProperties> = {
    error: { background: '#FDECEA', color: '#B42318' },
    success: { background: '#E8F3EC', color: '#14502F' },
    info: { background: '#EEF3FA', color: '#1D3F78' },
  };
  return (
    <div role={kind === 'error' ? 'alert' : 'status'} style={{ padding: '10px 12px', borderRadius: 10, fontSize: 13.5, fontWeight: 600, ...styles[kind] }}>
      {children}
    </div>
  );
}

// A card with a clear heading, an optional one-line description and an optional action on the right.
export function SectionCard({
  title,
  description,
  action,
  children,
  footer,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <section className="card" style={{ overflow: 'hidden' }}>
      <header style={{ padding: '16px 20px', display: 'flex', alignItems: 'flex-start', gap: 12, borderBottom: '1px solid var(--border-light)' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>{title}</h2>
          {description && <p className="muted" style={{ margin: '4px 0 0', fontSize: 13, lineHeight: 1.45 }}>{description}</p>}
        </div>
        {action}
      </header>
      <div style={{ padding: 20 }}>{children}</div>
      {footer && <footer style={{ padding: '12px 20px', borderTop: '1px solid var(--border-light)', background: '#FAFBF9', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>{footer}</footer>}
    </section>
  );
}

// A dialog over the page. Closes on Escape, on a click outside, or with the close button.
export function Modal({
  title,
  subtitle,
  onClose,
  children,
  footer,
  width = 560,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  width?: number;
}) {
  const titleId = useId();
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return createPortal(
    <div
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      style={{ position: 'fixed', inset: 0, zIndex: 70, background: 'rgba(13, 29, 20, .45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="card"
        style={{ width: `min(${width}px, 100%)`, maxHeight: '92vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#fff' }}
      >
        <header style={{ padding: '16px 20px', display: 'flex', alignItems: 'flex-start', gap: 12, borderBottom: '1px solid var(--border-light)' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2 id={titleId} style={{ margin: 0, fontSize: 17, fontWeight: 700 }}>{title}</h2>
            {subtitle && <p className="muted" style={{ margin: '4px 0 0', fontSize: 13 }}>{subtitle}</p>}
          </div>
          <button type="button" className="btn" aria-label="Close" onClick={onClose} style={{ minHeight: 40, minWidth: 40 }}>✕</button>
        </header>
        <div style={{ padding: 20, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 14 }}>{children}</div>
        {footer && <footer style={{ padding: '12px 20px', borderTop: '1px solid var(--border-light)', display: 'flex', justifyContent: 'flex-end', gap: 10, flexWrap: 'wrap' }}>{footer}</footer>}
      </div>
    </div>,
    document.body,
  );
}

// A switch with a label. Keyboard and screen-reader friendly.
export function Switch({ checked, onChange, label, disabled, hint }: { checked: boolean; onChange: (next: boolean) => void; label: string; disabled?: boolean; hint?: string }) {
  return (
    <label style={{ display: 'flex', alignItems: 'flex-start', gap: 12, cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.6 : 1 }}>
      <input type="checkbox" role="switch" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} style={{ position: 'absolute', opacity: 0, width: 0, height: 0 }} />
      <span
        aria-hidden
        style={{ width: 42, height: 24, borderRadius: 999, background: checked ? '#1F6B45' : '#C9D2C8', position: 'relative', flex: 'none', transition: 'background .15s', marginTop: 1 }}
      >
        <span style={{ position: 'absolute', top: 3, left: checked ? 21 : 3, width: 18, height: 18, borderRadius: '50%', background: '#fff', transition: 'left .15s', boxShadow: '0 1px 2px rgba(0,0,0,.2)' }} />
      </span>
      <span>
        <span style={{ fontWeight: 600, fontSize: 14 }}>{label}</span>
        {hint && <span className="muted" style={{ display: 'block', fontSize: 12.5, marginTop: 2 }}>{hint}</span>}
      </span>
    </label>
  );
}

// A small status pill.
export function StatusPill({ tone, children }: { tone: 'green' | 'grey' | 'amber' | 'red' | 'blue'; children: ReactNode }) {
  const cls = { green: 'pill g', grey: 'pill n', amber: 'pill a', red: 'pill rd', blue: 'pill b' }[tone];
  return <span className={cls}>{children}</span>;
}

// One collapsible part of a details panel. The header is a button, so it works with the keyboard.
export function AccordionItem({
  title,
  summary,
  open,
  onToggle,
  children,
}: {
  title: string;
  summary?: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <section style={{ borderTop: '1px solid #E6EBE4' }}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={onToggle}
        style={{ width: '100%', minHeight: 52, display: 'flex', alignItems: 'center', gap: 10, padding: '0 20px', background: 'none', border: 0, textAlign: 'left', cursor: 'pointer', color: '#17261E' }}
      >
        <span style={{ flex: 1, fontSize: 15, fontWeight: 700 }}>{title}</span>
        {summary && <span className="muted" style={{ fontSize: 13 }}>{summary}</span>}
        <span aria-hidden style={{ color: '#5C6E63', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .15s', fontSize: 13 }}>▼</span>
      </button>
      {open && <div id={id} style={{ padding: '2px 20px 18px' }}>{children}</div>}
    </section>
  );
}

// A label and its value on one line, for details panels.
export function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 16, padding: '7px 0', borderBottom: '1px dashed #E6EBE4' }}>
      <span className="muted" style={{ fontSize: 13.5 }}>{label}</span>
      <span style={{ fontSize: 14, fontWeight: 600, textAlign: 'right' }}>{children}</span>
    </div>
  );
}
