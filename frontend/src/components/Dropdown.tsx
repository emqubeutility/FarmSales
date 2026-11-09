import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';

// Shared dropdowns. The trigger uses the same .dd-trigger look as the app's selects (see index.css).
// The menu is drawn in a portal, so it is never clipped by a scrolling panel.

export interface DropdownOption<T extends string = string> {
  value: T;
  label: string;
}

interface FieldProps<T extends string> {
  id?: string;
  ariaLabel?: string;
  disabled?: boolean;
  /** Text on the trigger. */
  summary: string;
  /** True when nothing is chosen, so the summary reads as a placeholder. */
  empty?: boolean;
  options: DropdownOption<T>[];
  selected: T[];
  multiple: boolean;
  onPick: (value: T) => void;
}

const MENU_MAX_HEIGHT = 300;
const EDGE_GAP = 12;
const MENU_GAP = 4;

// Places the menu under the trigger, or above it when there is more room there.
function menuPlacement(trigger: HTMLElement): CSSProperties {
  const r = trigger.getBoundingClientRect();
  const below = window.innerHeight - r.bottom - EDGE_GAP;
  const above = r.top - EDGE_GAP;
  const openAbove = below < 200 && above > below;
  const room = openAbove ? above : below;
  const base: CSSProperties = { left: r.left, width: r.width, maxHeight: Math.max(120, Math.min(MENU_MAX_HEIGHT, room - MENU_GAP)) };
  return openAbove ? { ...base, bottom: window.innerHeight - r.top + MENU_GAP } : { ...base, top: r.bottom + MENU_GAP };
}

function CheckIcon({ size }: { size: number }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function DropdownField<T extends string>({
  id,
  ariaLabel,
  disabled,
  summary,
  empty,
  options,
  selected,
  multiple,
  onPick,
}: FieldProps<T>) {
  const [open, setOpen] = useState(false);
  const [style, setStyle] = useState<CSSProperties | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const focusedOnOpen = useRef(false);

  // Keep the menu beside the trigger while the page or a panel scrolls.
  useLayoutEffect(() => {
    const trigger = triggerRef.current;
    if (!open || !trigger) return;
    const place = () => setStyle(menuPlacement(trigger));
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open]);

  // A press outside the trigger and the menu closes it.
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      const target = e.target as Node;
      if (triggerRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  // Once the menu is placed, focus the chosen option (or the first) so arrow keys work at once.
  useEffect(() => {
    if (!open) {
      focusedOnOpen.current = false;
      return;
    }
    if (!style || focusedOnOpen.current || !menuRef.current) return;
    focusedOnOpen.current = true;
    const target =
      menuRef.current.querySelector<HTMLElement>('[aria-selected="true"]') ??
      menuRef.current.querySelector<HTMLElement>('[role="option"]');
    target?.focus();
  }, [open, style]);

  function close(restoreFocus: boolean) {
    setOpen(false);
    if (restoreFocus) triggerRef.current?.focus();
  }

  function onTriggerKey(e: KeyboardEvent<HTMLButtonElement>) {
    if (e.key === 'Escape' && open) {
      // Close only the menu, not the panel around it.
      e.stopPropagation();
      close(true);
    } else if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && !open) {
      e.preventDefault();
      setOpen(true);
    }
  }

  function onMenuKey(e: KeyboardEvent<HTMLDivElement>) {
    const items = Array.from(menuRef.current?.querySelectorAll<HTMLElement>('[role="option"]') ?? []);
    const index = items.indexOf(document.activeElement as HTMLElement);
    switch (e.key) {
      case 'Escape':
        e.stopPropagation();
        e.preventDefault();
        close(true);
        break;
      case 'Tab':
        e.preventDefault();
        close(true);
        break;
      case 'ArrowDown':
        e.preventDefault();
        items[Math.min(index + 1, items.length - 1)]?.focus();
        break;
      case 'ArrowUp':
        e.preventDefault();
        items[Math.max(index - 1, 0)]?.focus();
        break;
      case 'Home':
        e.preventDefault();
        items[0]?.focus();
        break;
      case 'End':
        e.preventDefault();
        items[items.length - 1]?.focus();
        break;
    }
  }

  function pick(value: T) {
    onPick(value);
    // A single choice closes the menu. A multi choice stays open for more ticks.
    if (!multiple) close(true);
  }

  return (
    <>
      <button
        ref={triggerRef}
        id={id}
        type="button"
        className={`dd-trigger${open ? ' is-open' : ''}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        disabled={disabled}
        onClick={() => (open ? close(false) : setOpen(true))}
        onKeyDown={onTriggerKey}
      >
        <span className={`dd-value${empty ? ' is-empty' : ''}`}>{summary}</span>
      </button>
      {open &&
        style &&
        createPortal(
          <div
            ref={menuRef}
            role="listbox"
            aria-multiselectable={multiple || undefined}
            className={`dd-menu${multiple ? '' : ' is-single'}`}
            style={style}
            onKeyDown={onMenuKey}
          >
            {options.map((o) => {
              const on = selected.includes(o.value);
              return (
                <button key={o.value} type="button" role="option" aria-selected={on} className="dd-option" onClick={() => pick(o.value)}>
                  {multiple && <span className="dd-box">{on && <CheckIcon size={12} />}</span>}
                  <span className="dd-option-label">{o.label}</span>
                  {!multiple && on && <span className="dd-tick"><CheckIcon size={14} /></span>}
                </button>
              );
            })}
          </div>,
          document.body,
        )}
    </>
  );
}

/** Pick one option. */
export function Dropdown<T extends string>({
  value,
  options,
  onChange,
  ...rest
}: {
  value: T;
  options: DropdownOption<T>[];
  onChange: (value: T) => void;
  id?: string;
  ariaLabel?: string;
  disabled?: boolean;
}) {
  const current = options.find((o) => o.value === value);
  return (
    <DropdownField
      {...rest}
      summary={current?.label ?? ''}
      options={options}
      selected={[value]}
      multiple={false}
      onPick={onChange}
    />
  );
}

/** Pick any number of options. An empty selection means "all", shown as the placeholder. */
export function MultiDropdown<T extends string>({
  values,
  options,
  onChange,
  placeholder = 'All',
  ...rest
}: {
  values: T[];
  options: DropdownOption<T>[];
  onChange: (values: T[]) => void;
  placeholder?: string;
  id?: string;
  ariaLabel?: string;
  disabled?: boolean;
}) {
  const labels = options.filter((o) => values.includes(o.value)).map((o) => o.label);
  const summary = labels.length === 0 ? placeholder : labels.length <= 2 ? labels.join(', ') : `${labels.length} selected`;
  const toggle = (v: T) => onChange(values.includes(v) ? values.filter((x) => x !== v) : [...values, v]);
  return (
    <DropdownField
      {...rest}
      summary={summary}
      empty={labels.length === 0}
      options={options}
      selected={values}
      multiple
      onPick={toggle}
    />
  );
}
