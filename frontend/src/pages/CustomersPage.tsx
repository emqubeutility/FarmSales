import { useEffect, useMemo, useState } from 'react';
import { createCustomerSchema, INDIAN_STATES, type CreateCustomerDto, type UpdateCustomerDto } from '@farm-sales/shared';
import { api, ApiError } from '../lib/api.js';
import { formatDate, formatPaise } from '../lib/format.js';
import { useAuth } from '../lib/auth-context.js';
import { SortTh, useTableSort } from '../lib/table-sort.js';
import { SkeletonBlock, LoadingRow } from '../components/Skeleton.js';
import { AccordionItem, DetailRow, Field, Modal, Notice, StatusPill, Switch } from '../components/ui.js';
import { usePaging, TablePagination } from '../components/Pagination.js';

interface CustomerRow {
  id: string;
  name: string;
  type: 'RETAIL' | 'B2B';
  phone: string | null;
  addressLine: string | null;
  landmark: string | null;
  city: string | null;
  state: string | null;
  pincode: string | null;
  gstin: string | null;
  creditLimitPaise: number | null;
  termsDays: number | null;
  active: boolean;
  createdAt: string;
  orderCount: number;
  totalSpentPaise: number;
  lastOrderAt: string | null;
}

interface CustomerDetail extends CustomerRow {
  orders: { id: string; code: string; status: string; channel: string; totalPaise: number; createdAt: string; sale: { number: string } | null }[];
}

type TypeFilter = 'ALL' | 'RETAIL' | 'B2B';
type SectionKey = 'contact' | 'address' | 'business' | 'orders';

const typeLabel = { RETAIL: 'Retail', B2B: 'B2B' } as const;
const orderStatusLabel: Record<string, string> = { NEW: 'New', PACKED: 'Packed', DISPATCHED: 'Out for delivery', DELIVERED: 'Delivered', CANCELLED: 'Cancelled' };

// The form values as typed. Numbers stay as text until they are checked.
interface CustomerForm {
  name: string;
  type: 'RETAIL' | 'B2B';
  phone: string;
  addressLine: string;
  landmark: string;
  city: string;
  state: string;
  pincode: string;
  gstin: string;
  creditLimit: string; // rupees
  termsDays: string;
  active: boolean;
}

function emptyForm(): CustomerForm {
  return { name: '', type: 'RETAIL', phone: '', addressLine: '', landmark: '', city: '', state: '', pincode: '', gstin: '', creditLimit: '', termsDays: '', active: true };
}

function formFrom(c: CustomerRow): CustomerForm {
  return {
    name: c.name,
    type: c.type,
    phone: c.phone ?? '',
    addressLine: c.addressLine ?? '',
    landmark: c.landmark ?? '',
    city: c.city ?? '',
    state: c.state ?? '',
    pincode: c.pincode ?? '',
    gstin: c.gstin ?? '',
    creditLimit: c.creditLimitPaise !== null ? (c.creditLimitPaise / 100).toFixed(2) : '',
    termsDays: c.termsDays !== null ? String(c.termsDays) : '',
    active: c.active,
  };
}

// The request body. A new customer leaves empty fields out; an edit sends null to clear a field.
function bodyFrom(f: CustomerForm, mode: 'create' | 'edit') {
  const text = (v: string) => (v.trim() ? v.trim() : mode === 'edit' ? null : undefined);
  const rupees = f.creditLimit.trim() ? Math.round(Number(f.creditLimit) * 100) : undefined;
  const days = f.termsDays.trim() ? Number(f.termsDays) : undefined;
  const base = {
    name: f.name.trim(),
    type: f.type,
    phone: text(f.phone),
    addressLine: text(f.addressLine),
    landmark: text(f.landmark),
    city: text(f.city),
    state: f.state || (mode === 'edit' ? null : undefined),
    pincode: text(f.pincode),
    gstin: text(f.gstin)?.toUpperCase() ?? (mode === 'edit' ? null : undefined),
    creditLimitPaise: rupees ?? (mode === 'edit' ? null : undefined),
    termsDays: days ?? (mode === 'edit' ? null : undefined),
  };
  return mode === 'edit' ? { ...base, active: f.active } : base;
}

// Field problems, keyed by the form field. The shared schema decides what is valid.
function formErrors(f: CustomerForm, mode: 'create' | 'edit'): Partial<Record<keyof CustomerForm, string>> {
  const errors: Partial<Record<keyof CustomerForm, string>> = {};
  const body = bodyFrom(f, mode);
  const checked = createCustomerSchema.safeParse({ ...body, phone: body.phone ?? undefined, addressLine: body.addressLine ?? undefined, landmark: body.landmark ?? undefined, city: body.city ?? undefined, state: body.state ?? undefined, pincode: body.pincode ?? undefined, gstin: body.gstin ?? undefined, creditLimitPaise: body.creditLimitPaise ?? undefined, termsDays: body.termsDays ?? undefined });
  if (!checked.success) {
    const keyMap: Record<string, keyof CustomerForm> = { creditLimitPaise: 'creditLimit' };
    for (const issue of checked.error.issues) {
      const raw = String(issue.path[0] ?? '');
      const key = keyMap[raw] ?? (raw as keyof CustomerForm);
      if (key && !errors[key]) errors[key] = issue.message;
    }
  }
  if (f.creditLimit.trim() && (!Number.isFinite(Number(f.creditLimit)) || Number(f.creditLimit) < 0)) errors.creditLimit = 'Enter an amount of 0 or more';
  if (f.termsDays.trim() && !/^\d+$/.test(f.termsDays.trim())) errors.termsDays = 'Enter whole days, for example 30';
  return errors;
}

export function CustomersPage() {
  const { user } = useAuth();
  const isOwner = !!user?.roles.includes('OWNER');
  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('ALL');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<CustomerDetail | null>(null);
  const [open, setOpen] = useState<Record<SectionKey, boolean>>({ contact: true, address: true, business: false, orders: false });
  const [editor, setEditor] = useState<{ mode: 'create' } | { mode: 'edit'; customer: CustomerRow } | null>(null);

  async function load() {
    try {
      setCustomers(await api.get<CustomerRow[]>('/customers'));
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load customers');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  useEffect(() => {
    if (!selectedId) { setDetail(null); return; }
    setDetail(null);
    api.get<CustomerDetail>(`/customers/${selectedId}`)
      .then(setDetail)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Could not load this customer'));
  }, [selectedId]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return customers.filter((c) => {
      if (typeFilter !== 'ALL' && c.type !== typeFilter) return false;
      if (!term) return true;
      return [c.name, c.phone ?? '', c.city ?? '', c.pincode ?? '', c.gstin ?? ''].some((v) => v.toLowerCase().includes(term));
    });
  }, [customers, search, typeFilter]);

  const sortable = useTableSort(filtered, {
    name: (c: CustomerRow) => c.name,
    type: (c: CustomerRow) => c.type,
    location: (c: CustomerRow) => c.city ?? '',
    orders: (c: CustomerRow) => c.orderCount,
    spent: (c: CustomerRow) => c.totalSpentPaise,
    last: (c: CustomerRow) => (c.lastOrderAt ? new Date(c.lastOrderAt).getTime() : 0),
  });


  function toggle(key: SectionKey) {
    setOpen((s) => ({ ...s, [key]: !s[key] }));
  }

  async function reloadAfterSave(id?: string) {
    await load();
    if (id) setSelectedId(id);
  }

  const { pageRows, paging } = usePaging(sortable.rows);
  return (
    <>
      <div className="top" style={{ gap: 12 }}>
        <div>
          <h1>Customers</h1>
          <div className="muted" style={{ fontSize: 12 }}>People who ordered, and the customers you saved</div>
        </div>
        <div style={{ flex: 1 }} />
        <div role="group" aria-label="Customer type" style={{ display: 'flex', background: '#EEF1EC', borderRadius: 10, padding: 3, gap: 2 }}>
              {([
                { value: 'ALL', label: 'All' },
                { value: 'RETAIL', label: 'Retail' },
                { value: 'B2B', label: 'B2B' },
              ] as const).map((f) => (
                <button
                  key={f.value}
                  type="button"
                  aria-pressed={typeFilter === f.value}
                  onClick={() => setTypeFilter(f.value)}
                  style={{ minHeight: 36, padding: '0 14px', border: 0, borderRadius: 8, fontSize: 13, fontWeight: 600, background: typeFilter === f.value ? '#fff' : 'transparent', color: typeFilter === f.value ? '#12301F' : '#3E4F45', cursor: 'pointer' }}
                >
                  {f.label}
                </button>
              ))}
            </div>

        <input className="in" style={{ width: 280 }} placeholder="Search name, mobile, city, GSTIN" aria-label="Search customers" value={search} onChange={(e) => setSearch(e.target.value)} />
        {isOwner && <button className="btn p" style={{ minHeight: 40, whiteSpace: "nowrap" }} onClick={() => setEditor({ mode: "create" })}>Add customer</button>}
      </div>

      <div className="body" style={{ flexDirection: 'column', gap: 16 }}>
        {error && <Notice kind="error">{error}</Notice>}


        <section className="card" style={{ display: 'flex', flexDirection: 'column', minHeight: 0, maxHeight: '100%', flex: 1, overflow: 'hidden' }}>
          
          <div style={{ overflow: 'auto', flex: 1 }}>
            {loading ? (
              <table className="tbl"><tbody><LoadingRow columns={6} /></tbody></table>
            ) : (
              <table className="tbl">
                <thead>
                  <tr>
                    <SortTh label="Customer" sortKey="name" sort={sortable.sort} onSort={sortable.toggle} />
                    <SortTh label="Type" sortKey="type" sort={sortable.sort} onSort={sortable.toggle} />
                    <SortTh label="City" sortKey="location" sort={sortable.sort} onSort={sortable.toggle} />
                    <SortTh label="Orders" sortKey="orders" align="r" sort={sortable.sort} onSort={sortable.toggle} />
                    <SortTh label="Total spent" sortKey="spent" align="r" sort={sortable.sort} onSort={sortable.toggle} />
                    <SortTh label="Last order" sortKey="last" sort={sortable.sort} onSort={sortable.toggle} />
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((c) => (
                    <tr key={c.id} className={selectedId === c.id ? 'sel' : ''} style={{ cursor: 'pointer' }} onClick={() => setSelectedId(c.id)}>
                      <td>
                        <strong>{c.name}</strong>
                        {!c.active && <span className="pill n" style={{ marginLeft: 6 }}>Inactive</span>}
                        <div className="muted" style={{ fontSize: 12 }}>{c.phone ?? 'No mobile on file'}</div>
                      </td>
                      <td><StatusPill tone={c.type === 'B2B' ? 'blue' : 'grey'}>{typeLabel[c.type]}</StatusPill></td>
                      <td>{c.city ? `${c.city}${c.pincode ? ` · ${c.pincode}` : ''}` : <span className="muted">—</span>}</td>
                      <td className="r">{c.orderCount}</td>
                      <td className="r"><strong>{formatPaise(c.totalSpentPaise)}</strong></td>
                      <td className="muted">{c.lastOrderAt ? formatDate(c.lastOrderAt) : 'No orders yet'}</td>
                      <td><button type="button" className="btn" style={{ minHeight: 36, padding: '0 12px' }} onClick={(e) => { e.stopPropagation(); setSelectedId(c.id); }}>Open</button></td>
                    </tr>
                  ))}
                  {filtered.length === 0 && (
                    <tr>
                      <td colSpan={7} style={{ textAlign: 'center', padding: 40 }}>
                        <div style={{ fontWeight: 600 }}>{customers.length === 0 ? 'No customers yet' : 'No customers match'}</div>
                        <div className="muted" style={{ marginTop: 5, fontSize: 13 }}>
                          {customers.length === 0 ? 'A customer is added automatically when an order has a mobile number.' : 'Try another search or type.'}
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}
          </div>
          {!loading && <TablePagination {...paging} />}
        </section>
      </div>

      {selectedId && (
        <div
          role="presentation"
          onMouseDown={(e) => { if (e.target === e.currentTarget) setSelectedId(null); }}
          style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(13, 29, 20, .28)', display: 'flex', justifyContent: 'flex-end' }}
        >
          <aside role="dialog" aria-modal="true" aria-label="Customer details" style={{ width: 'min(560px, 100vw)', height: '100%', background: '#F7F9F6', boxShadow: '-12px 0 40px rgba(0,0,0,.14)', display: 'flex', flexDirection: 'column' }}>
            <header style={{ background: '#fff', padding: '18px 20px', borderBottom: '1px solid #E6EBE4', display: 'flex', alignItems: 'flex-start', gap: 12 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <h2 style={{ margin: 0, fontSize: 21 }}>{detail?.name ?? 'Loading…'}</h2>
                  {detail && <StatusPill tone={detail.type === 'B2B' ? 'blue' : 'grey'}>{typeLabel[detail.type]}</StatusPill>}
                  {detail && !detail.active && <StatusPill tone="red">Inactive</StatusPill>}
                </div>
                {detail && <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>{detail.phone ?? 'No mobile on file'}</div>}
              </div>
              {isOwner && detail && (
                <button type="button" className="btn p" style={{ minHeight: 40 }} onClick={() => setEditor({ mode: 'edit', customer: detail })}>Edit</button>
              )}
              <button type="button" className="btn" aria-label="Close details" style={{ minHeight: 40, minWidth: 40 }} onClick={() => setSelectedId(null)}>✕</button>
            </header>

            {detail ? (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 10, padding: 16 }}>
                  {[
                    { label: 'Orders', value: String(detail.orderCount) },
                    { label: 'Total spent', value: formatPaise(detail.totalSpentPaise) },
                    { label: 'Last order', value: detail.lastOrderAt ? formatDate(detail.lastOrderAt) : '—' },
                  ].map((s) => (
                    <div key={s.label} className="card" style={{ padding: '10px 12px' }}>
                      <div className="muted" style={{ fontSize: 12 }}>{s.label}</div>
                      <div style={{ fontWeight: 700, fontSize: 15, marginTop: 2 }}>{s.value}</div>
                    </div>
                  ))}
                </div>
                <div style={{ overflowY: 'auto', flex: 1, background: '#fff', borderTop: '1px solid #E6EBE4' }}>
                  <AccordionItem title="Contact" summary={detail.phone ?? undefined} open={open.contact} onToggle={() => toggle('contact')}>
                    <DetailRow label="Name">{detail.name}</DetailRow>
                    <DetailRow label="Mobile">{detail.phone ?? 'Not on file'}</DetailRow>
                    <DetailRow label="Customer since">{formatDate(detail.createdAt)}</DetailRow>
                  </AccordionItem>
                  <AccordionItem title="Address" summary={detail.city ?? undefined} open={open.address} onToggle={() => toggle('address')}>
                    <DetailRow label="Address">{detail.addressLine ?? 'Not on file'}</DetailRow>
                    <DetailRow label="Landmark">{detail.landmark ?? '—'}</DetailRow>
                    <DetailRow label="City">{detail.city ?? '—'}</DetailRow>
                    <DetailRow label="State">{detail.state ?? '—'}</DetailRow>
                    <DetailRow label="Pincode">{detail.pincode ?? '—'}</DetailRow>
                  </AccordionItem>
                  <AccordionItem title="Business" summary={detail.type === 'B2B' ? 'B2B account' : 'Retail'} open={open.business} onToggle={() => toggle('business')}>
                    <DetailRow label="Type">{typeLabel[detail.type]}</DetailRow>
                    <DetailRow label="GSTIN">{detail.gstin ?? 'Not on file'}</DetailRow>
                    <DetailRow label="Credit limit">{detail.creditLimitPaise !== null ? formatPaise(detail.creditLimitPaise) : '—'}</DetailRow>
                    <DetailRow label="Payment terms">{detail.termsDays !== null ? `${detail.termsDays} days` : '—'}</DetailRow>
                  </AccordionItem>
                  <AccordionItem title="Orders" summary={`${detail.orders.length}`} open={open.orders} onToggle={() => toggle('orders')}>
                    {detail.orders.length === 0 && <div className="muted" style={{ fontSize: 14 }}>No orders yet.</div>}
                    {detail.orders.map((o) => (
                      <div key={o.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '10px 0', borderBottom: '1px solid #EEF2EC' }}>
                        <div>
                          <div style={{ fontWeight: 600, fontSize: 14 }}>{o.code}{o.sale ? ` · Bill ${o.sale.number}` : ''}</div>
                          <div className="muted" style={{ fontSize: 12.5 }}>{formatDate(o.createdAt)} · {orderStatusLabel[o.status] ?? o.status}</div>
                        </div>
                        <strong style={{ fontSize: 14 }}>{formatPaise(o.totalPaise)}</strong>
                      </div>
                    ))}
                  </AccordionItem>
                </div>
              </>
            ) : (
              <div style={{ padding: 20 }}><SkeletonBlock height={200} /></div>
            )}
          </aside>
        </div>
      )}

      {editor && (
        <CustomerEditor
          mode={editor.mode}
          customer={editor.mode === 'edit' ? editor.customer : undefined}
          onClose={() => setEditor(null)}
          onSaved={async (id) => {
            setEditor(null);
            await reloadAfterSave(id);
          }}
        />
      )}
    </>
  );
}

function CustomerEditor({
  mode,
  customer,
  onClose,
  onSaved,
}: {
  mode: 'create' | 'edit';
  customer?: CustomerRow;
  onClose: () => void;
  onSaved: (id: string) => void | Promise<void>;
}) {
  const [form, setForm] = useState<CustomerForm>(() => (customer ? formFrom(customer) : emptyForm()));
  const [touched, setTouched] = useState<Partial<Record<keyof CustomerForm, boolean>>>({});
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const errors = formErrors(form, mode);
  const shown = (key: keyof CustomerForm) => (submitted || touched[key] ? errors[key] : undefined);

  function set<K extends keyof CustomerForm>(key: K, value: CustomerForm[K]) {
    setSaveError(null);
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function save() {
    setSubmitted(true);
    if (Object.keys(errors).length > 0) {
      setSaveError('Check the highlighted fields.');
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      const body = bodyFrom(form, mode);
      if (mode === 'create') {
        const created = await api.post<{ id: string }>('/customers', body as CreateCustomerDto);
        await onSaved(created.id);
      } else if (customer) {
        await api.patch(`/customers/${customer.id}`, body as UpdateCustomerDto);
        await onSaved(customer.id);
      }
    } catch (err) {
      setSaveError(err instanceof ApiError ? err.message : 'Could not save the customer');
    } finally {
      setSaving(false);
    }
  }

  const blur = (key: keyof CustomerForm) => () => setTouched((t) => ({ ...t, [key]: true }));

  return (
    <Modal
      title={mode === 'create' ? 'Add customer' : `Edit ${customer?.name ?? 'customer'}`}
      subtitle={mode === 'create' ? 'Name and type are needed. Everything else can be added later.' : 'Changes apply to this customer only.'}
      onClose={onClose}
      width={640}
      footer={
        <>
          <button type="button" className="btn" style={{ minHeight: 44 }} onClick={onClose}>Cancel</button>
          <button type="button" className="btn p" style={{ minHeight: 44 }} disabled={saving} onClick={() => void save()}>
            {saving ? 'Saving…' : mode === 'create' ? 'Add customer' : 'Save changes'}
          </button>
        </>
      }
    >
      {saveError && <Notice kind="error">{saveError}</Notice>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 14 }}>
        <Field label="Name" required error={shown('name')} style={{ gridColumn: '1 / -1' }}>
          {({ id, invalid }) => (
            <input id={id} className="in" value={form.name} maxLength={80} aria-invalid={invalid} onChange={(e) => set('name', e.target.value)} onBlur={blur('name')} />
          )}
        </Field>
        <Field label="Customer type" required error={shown('type')}>
          {({ id }) => (
            <select id={id} className="in" value={form.type} onChange={(e) => set('type', e.target.value as CustomerForm['type'])}>
              <option value="RETAIL">Retail (walk-in or online buyer)</option>
              <option value="B2B">B2B (business account)</option>
            </select>
          )}
        </Field>
        <Field label="Mobile number" error={shown('phone')} hint="10 digits, starts with 6 to 9">
          {({ id, invalid }) => (
            <input id={id} className="in" inputMode="numeric" value={form.phone} aria-invalid={invalid} onChange={(e) => set('phone', e.target.value.replace(/\D/g, '').slice(0, 10))} onBlur={blur('phone')} />
          )}
        </Field>
        <Field label="Address line" error={shown('addressLine')} style={{ gridColumn: '1 / -1' }}>
          {({ id, invalid }) => (
            <input id={id} className="in" value={form.addressLine} maxLength={200} placeholder="House or flat no., building, street, area" aria-invalid={invalid} onChange={(e) => set('addressLine', e.target.value)} onBlur={blur('addressLine')} />
          )}
        </Field>
        <Field label="Landmark" error={shown('landmark')}>
          {({ id, invalid }) => (
            <input id={id} className="in" value={form.landmark} maxLength={100} aria-invalid={invalid} onChange={(e) => set('landmark', e.target.value)} onBlur={blur('landmark')} />
          )}
        </Field>
        <Field label="City" error={shown('city')}>
          {({ id, invalid }) => (
            <input id={id} className="in" value={form.city} maxLength={60} aria-invalid={invalid} onChange={(e) => set('city', e.target.value)} onBlur={blur('city')} />
          )}
        </Field>
        <Field label="State" error={shown('state')}>
          {({ id, invalid }) => (
            <select id={id} className="in" value={form.state} aria-invalid={invalid} onChange={(e) => set('state', e.target.value)}>
              <option value="">Choose a state</option>
              {INDIAN_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          )}
        </Field>
        <Field label="Pincode" error={shown('pincode')}>
          {({ id, invalid }) => (
            <input id={id} className="in" inputMode="numeric" value={form.pincode} aria-invalid={invalid} onChange={(e) => set('pincode', e.target.value.replace(/\D/g, '').slice(0, 6))} onBlur={blur('pincode')} />
          )}
        </Field>
        <Field label="GSTIN" error={shown('gstin')} hint="Only for businesses that have one" style={{ gridColumn: '1 / -1' }}>
          {({ id, invalid }) => (
            <input id={id} className="in" value={form.gstin} maxLength={15} aria-invalid={invalid} style={{ textTransform: 'uppercase' }} onChange={(e) => set('gstin', e.target.value.toUpperCase())} onBlur={blur('gstin')} />
          )}
        </Field>
        <Field label="Credit limit (₹)" error={shown('creditLimit')} hint="Leave empty for no limit">
          {({ id, invalid }) => (
            <input id={id} className="in" inputMode="decimal" value={form.creditLimit} aria-invalid={invalid} onChange={(e) => set('creditLimit', e.target.value)} onBlur={blur('creditLimit')} />
          )}
        </Field>
        <Field label="Payment terms (days)" error={shown('termsDays')} hint="For example 30">
          {({ id, invalid }) => (
            <input id={id} className="in" inputMode="numeric" value={form.termsDays} aria-invalid={invalid} onChange={(e) => set('termsDays', e.target.value)} onBlur={blur('termsDays')} />
          )}
        </Field>
        {mode === 'edit' && (
          <div style={{ gridColumn: '1 / -1', padding: '4px 0' }}>
            <Switch checked={form.active} onChange={(v) => set('active', v)} label="Active" hint="An inactive customer is kept for records but is not offered for new orders." />
          </div>
        )}
      </div>
    </Modal>
  );
}

