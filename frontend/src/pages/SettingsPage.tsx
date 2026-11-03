import { useEffect, useState } from 'react';
import type { Channel, Role } from '@farm-sales/shared';
import { api, ApiError } from '../lib/api.js';
import { formatPaise } from '../lib/format.js';
import { SortTh, useTableSort } from '../lib/table-sort.js';

const ALL_ROLES: Role[] = ['OWNER', 'CASHIER', 'WAREHOUSE', 'DELIVERY'];
const ALL_CHANNELS: Channel[] = ['WALK_IN', 'PHONE', 'ONLINE'];

function ErrorLine({ error }: { error: string | null }) {
  if (!error) return null;
  return <div className="error-banner">{error}</div>;
}

// ---------- Business profile ----------

interface BusinessProfile {
  name: string;
  address: string | null;
  gstin: string | null;
  fssaiNumber: string | null;
  phone: string | null;
  email: string | null;
  logoUrl: string | null;
  upiId: string | null;
  upiQrImageUrl: string | null;
}

const emptyBusinessForm = { name: '', address: '', gstin: '', fssaiNumber: '', phone: '', email: '', logoUrl: '', upiId: '', upiQrImageUrl: '' };

function BusinessProfileCard() {
  const [form, setForm] = useState(emptyBusinessForm);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  function load() {
    api.get<BusinessProfile>('/business-profile').then((p) => {
      setForm({
        name: p.name,
        address: p.address ?? '',
        gstin: p.gstin ?? '',
        fssaiNumber: p.fssaiNumber ?? '',
        phone: p.phone ?? '',
        email: p.email ?? '',
        logoUrl: p.logoUrl ?? '',
        upiId: p.upiId ?? '',
        upiQrImageUrl: p.upiQrImageUrl ?? '',
      });
    });
  }
  useEffect(load, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(false);
    setSaving(true);
    try {
      await api.patch('/business-profile', {
        name: form.name,
        address: form.address || undefined,
        gstin: form.gstin || undefined,
        fssaiNumber: form.fssaiNumber || undefined,
        phone: form.phone || undefined,
        email: form.email || undefined,
        logoUrl: form.logoUrl || undefined,
        upiId: form.upiId || undefined,
        upiQrImageUrl: form.upiQrImageUrl || undefined,
      });
      setSaved(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save business profile');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={save} className="card" style={{ overflow: 'hidden' }}>
      <div style={{ padding: '12px 16px', fontWeight: 700, borderBottom: '1px solid var(--border-light)' }}>Business profile</div>
      <ErrorLine error={error} />
      <div style={{ padding: 16, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <div style={{ gridColumn: 'span 2' }}>
          <label className="lbl">Company name</label>
          <input className="in" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
        </div>
        <div style={{ gridColumn: 'span 2' }}>
          <label className="lbl">Address</label>
          <textarea className="in" style={{ height: 60, paddingTop: 8, resize: 'vertical' }} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
        </div>
        <div>
          <label className="lbl">GSTIN</label>
          <input className="in" value={form.gstin} onChange={(e) => setForm({ ...form, gstin: e.target.value })} />
        </div>
        <div>
          <label className="lbl">FSSAI number</label>
          <input className="in" value={form.fssaiNumber} onChange={(e) => setForm({ ...form, fssaiNumber: e.target.value })} />
        </div>
        <div>
          <label className="lbl">Phone</label>
          <input className="in" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
        </div>
        <div>
          <label className="lbl">Email</label>
          <input className="in" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </div>
        <div>
          <label className="lbl">Logo URL</label>
          <input className="in" placeholder="https://…" value={form.logoUrl} onChange={(e) => setForm({ ...form, logoUrl: e.target.value })} />
        </div>
        <div>
          <label className="lbl">UPI ID</label>
          <input className="in" placeholder="business@upi" value={form.upiId} onChange={(e) => setForm({ ...form, upiId: e.target.value })} />
        </div>
        <div style={{ gridColumn: 'span 2' }}>
          <label className="lbl">UPI QR code image URL</label>
          <input className="in" placeholder="https://…" value={form.upiQrImageUrl} onChange={(e) => setForm({ ...form, upiQrImageUrl: e.target.value })} />
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0 16px 16px' }}>
        <button type="submit" className="btn p" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
        {saved && <span className="muted" style={{ fontSize: 13 }}>Saved.</span>}
      </div>
      <div className="muted" style={{ padding: '0 16px 14px', fontSize: 12.5 }}>
        Shown on printed bills and the online shop. Owner only. Logo/QR are image URLs (hosted elsewhere) — no upload here.
      </div>
    </form>
  );
}

// ---------- Channels & discounts ----------

interface ChannelDiscountRow { channel: Channel; defaultPct: string; maxPct: string }

function ChannelDiscountsCard() {
  const [drafts, setDrafts] = useState<Record<Channel, { defaultPct: string; maxPct: string }>>({} as never);
  const sortable = useTableSort(ALL_CHANNELS, {
    channel: (c) => c,
    defaultPct: (c) => Number(drafts[c]?.defaultPct ?? 0),
    maxPct: (c) => Number(drafts[c]?.maxPct ?? 0),
  });
  const [error, setError] = useState<string | null>(null);

  function load() {
    api.get<ChannelDiscountRow[]>('/channel-discounts').then((data) => {
      setDrafts(Object.fromEntries(ALL_CHANNELS.map((c) => {
        const existing = data.find((d) => d.channel === c);
        return [c, { defaultPct: existing?.defaultPct ?? '0', maxPct: existing?.maxPct ?? '0' }];
      })) as never);
    });
  }

  useEffect(load, []);

  async function save(channel: Channel) {
    setError(null);
    try {
      await api.post('/channel-discounts', {
        channel,
        defaultPct: Number(drafts[channel].defaultPct),
        maxPct: Number(drafts[channel].maxPct),
      });
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save');
    }
  }

  return (
    <div className="card" style={{ overflow: 'hidden' }}>
      <div style={{ padding: '12px 16px', fontWeight: 700, borderBottom: '1px solid var(--border-light)' }}>Channels and discounts</div>
      <ErrorLine error={error} />
      <table className="tbl">
        <thead>
          <tr>
            <SortTh label="Channel" sortKey="channel" sort={sortable.sort} onSort={sortable.toggle} />
            <SortTh label="Default %" sortKey="defaultPct" align="r" sort={sortable.sort} onSort={sortable.toggle} />
            <SortTh label="Cashier max %" sortKey="maxPct" align="r" sort={sortable.sort} onSort={sortable.toggle} />
            <th></th>
          </tr>
        </thead>
        <tbody>
          {sortable.rows.map((c) => (
            <tr key={c}>
              <td>{c.replace('_', '-')}</td>
              <td className="r">
                <input className="in" style={{ width: 70, textAlign: 'right' }} type="number" value={drafts[c]?.defaultPct ?? ''}
                  onChange={(e) => setDrafts((p) => ({ ...p, [c]: { ...p[c], defaultPct: e.target.value } }))} />
              </td>
              <td className="r">
                <input className="in" style={{ width: 70, textAlign: 'right' }} type="number" value={drafts[c]?.maxPct ?? ''}
                  onChange={(e) => setDrafts((p) => ({ ...p, [c]: { ...p[c], maxPct: e.target.value } }))} />
              </td>
              <td><button type="button" className="btn" onClick={() => save(c)}>Save</button></td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="muted" style={{ padding: '10px 16px', fontSize: 12.5 }}>Cashiers can set any value from 0 up to the max. The server blocks anything higher. Edit the numbers above and press Save on that row.</div>
    </div>
  );
}

// ---------- Delivery zones ----------

interface Zone { id: string; name: string; pincodes: string | null; feePaise: number; freeFromPaise: number; active: boolean }

function ZonesCard() {
  const [zones, setZones] = useState<Zone[]>([]);
  const sortable = useTableSort(zones, {
    zone: (z) => z.name,
    pincodes: (z) => z.pincodes,
    fee: (z) => z.feePaise,
    freeFrom: (z) => z.freeFromPaise,
  });
  const [form, setForm] = useState({ name: '', pincodes: '', feePaise: '', freeFromPaise: '' });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState({ name: '', pincodes: '', feePaise: '', freeFromPaise: '' });
  const [error, setError] = useState<string | null>(null);

  function load() { api.get<Zone[]>('/zones').then(setZones); }
  useEffect(load, []);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await api.post('/zones', {
        name: form.name,
        pincodes: form.pincodes || undefined,
        feePaise: Math.round(Number(form.feePaise) * 100),
        freeFromPaise: Math.round(Number(form.freeFromPaise) * 100),
      });
      setForm({ name: '', pincodes: '', feePaise: '', freeFromPaise: '' });
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save zone');
    }
  }

  function startEdit(z: Zone) {
    setEditingId(z.id);
    setEditDraft({ name: z.name, pincodes: z.pincodes ?? '', feePaise: (z.feePaise / 100).toFixed(2), freeFromPaise: (z.freeFromPaise / 100).toFixed(2) });
    setError(null);
  }

  async function saveEdit(id: string) {
    setError(null);
    try {
      await api.patch(`/zones/${id}`, {
        name: editDraft.name,
        pincodes: editDraft.pincodes || undefined,
        feePaise: Math.round(Number(editDraft.feePaise) * 100),
        freeFromPaise: Math.round(Number(editDraft.freeFromPaise) * 100),
      });
      setEditingId(null);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save changes');
    }
  }

  async function toggleActive(z: Zone) {
    setError(null);
    try {
      await api.patch(`/zones/${z.id}`, { active: !z.active });
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not update zone');
    }
  }

  return (
    <div className="card" style={{ overflow: 'hidden' }}>
      <div style={{ padding: '12px 16px', fontWeight: 700, borderBottom: '1px solid var(--border-light)' }}>Delivery zones</div>
      <ErrorLine error={error} />
      <table className="tbl">
        <thead>
          <tr>
            <SortTh label="Zone" sortKey="zone" sort={sortable.sort} onSort={sortable.toggle} />
            <SortTh label="Pincodes" sortKey="pincodes" sort={sortable.sort} onSort={sortable.toggle} />
            <SortTh label="Fee" sortKey="fee" align="r" sort={sortable.sort} onSort={sortable.toggle} />
            <SortTh label="Free from" sortKey="freeFrom" align="r" sort={sortable.sort} onSort={sortable.toggle} />
            <th></th>
          </tr>
        </thead>
        <tbody>
          {sortable.rows.map((z) => editingId === z.id ? (
            <tr key={z.id}>
              <td><input className="in" value={editDraft.name} onChange={(e) => setEditDraft({ ...editDraft, name: e.target.value })} /></td>
              <td><input className="in" value={editDraft.pincodes} onChange={(e) => setEditDraft({ ...editDraft, pincodes: e.target.value })} /></td>
              <td className="r"><input className="in" style={{ width: 90, textAlign: 'right' }} type="number" step="0.01" value={editDraft.feePaise} onChange={(e) => setEditDraft({ ...editDraft, feePaise: e.target.value })} /></td>
              <td className="r"><input className="in" style={{ width: 100, textAlign: 'right' }} type="number" step="0.01" value={editDraft.freeFromPaise} onChange={(e) => setEditDraft({ ...editDraft, freeFromPaise: e.target.value })} /></td>
              <td style={{ display: 'flex', gap: 6 }}>
                <button type="button" className="btn p" onClick={() => saveEdit(z.id)}>Save</button>
                <button type="button" className="btn" onClick={() => setEditingId(null)}>Cancel</button>
              </td>
            </tr>
          ) : (
            <tr key={z.id}>
              <td>{z.name}{!z.active && <span className="pill n" style={{ marginLeft: 6 }}>Inactive</span>}</td>
              <td className="muted">{z.pincodes ?? '—'}</td>
              <td className="r">{formatPaise(z.feePaise)}</td>
              <td className="r">{formatPaise(z.freeFromPaise)}</td>
              <td style={{ display: 'flex', gap: 6 }}>
                <button type="button" className="btn" onClick={() => startEdit(z)}>Edit</button>
                <button type="button" className="btn" onClick={() => toggleActive(z)}>{z.active ? 'Deactivate' : 'Activate'}</button>
              </td>
            </tr>
          ))}
          {zones.length === 0 && <tr><td colSpan={5} className="muted" style={{ textAlign: 'center', padding: 14 }}>No zones yet</td></tr>}
        </tbody>
      </table>
      <form onSubmit={add} style={{ display: 'grid', gridTemplateColumns: '1.5fr 1.5fr 1fr 1fr auto', gap: 8, padding: 12 }}>
        <input className="in" placeholder="Zone name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
        <input className="in" placeholder="Pincodes" value={form.pincodes} onChange={(e) => setForm({ ...form, pincodes: e.target.value })} />
        <input className="in" placeholder="Fee ₹" type="number" step="0.01" value={form.feePaise} onChange={(e) => setForm({ ...form, feePaise: e.target.value })} required />
        <input className="in" placeholder="Free from ₹" type="number" step="0.01" value={form.freeFromPaise} onChange={(e) => setForm({ ...form, freeFromPaise: e.target.value })} required />
        <button type="submit" className="btn p">Add zone</button>
      </form>
    </div>
  );
}

// ---------- Tax classes ----------

interface TaxRate { ratePct: string; effectiveFrom: string }
interface TaxClass { id: string; name: string; hsn: string | null; rates: TaxRate[] }

function TaxClassesCard() {
  const [classes, setClasses] = useState<TaxClass[]>([]);
  const sortable = useTableSort(classes, {
    category: (tc) => tc.name,
    hsn: (tc) => tc.hsn,
    currentGst: (tc) => (tc.rates[0] ? Number(tc.rates[0].ratePct) : null),
  });
  const [form, setForm] = useState({ name: '', hsn: '' });
  const [rateForm, setRateForm] = useState<{ taxClassId: string; ratePct: string; effectiveFrom: string }>({ taxClassId: '', ratePct: '', effectiveFrom: new Date().toISOString().slice(0, 10) });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState({ name: '', hsn: '' });
  const [error, setError] = useState<string | null>(null);

  function load() { api.get<TaxClass[]>('/tax-classes').then(setClasses); }
  useEffect(load, []);

  async function addClass(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await api.post('/tax-classes', { name: form.name, hsn: form.hsn || undefined });
      setForm({ name: '', hsn: '' });
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save tax class');
    }
  }

  function startEdit(tc: TaxClass) {
    setEditingId(tc.id);
    setEditDraft({ name: tc.name, hsn: tc.hsn ?? '' });
    setError(null);
  }

  async function saveEdit(id: string) {
    setError(null);
    try {
      await api.patch(`/tax-classes/${id}`, { name: editDraft.name, hsn: editDraft.hsn || undefined });
      setEditingId(null);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save changes');
    }
  }

  async function addRate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await api.post(`/tax-classes/${rateForm.taxClassId}/rates`, { ratePct: Number(rateForm.ratePct), effectiveFrom: rateForm.effectiveFrom });
      setRateForm({ ...rateForm, ratePct: '' });
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save rate');
    }
  }

  return (
    <div className="card" style={{ overflow: 'hidden' }}>
      <div style={{ padding: '12px 16px', fontWeight: 700, borderBottom: '1px solid var(--border-light)' }}>Tax classes</div>
      <ErrorLine error={error} />
      <table className="tbl">
        <thead>
          <tr>
            <SortTh label="Category" sortKey="category" sort={sortable.sort} onSort={sortable.toggle} />
            <SortTh label="HSN" sortKey="hsn" sort={sortable.sort} onSort={sortable.toggle} />
            <SortTh label="Current GST" sortKey="currentGst" align="r" sort={sortable.sort} onSort={sortable.toggle} />
            <th></th>
          </tr>
        </thead>
        <tbody>
          {sortable.rows.map((tc) => editingId === tc.id ? (
            <tr key={tc.id}>
              <td><input className="in" value={editDraft.name} onChange={(e) => setEditDraft({ ...editDraft, name: e.target.value })} /></td>
              <td><input className="in" value={editDraft.hsn} onChange={(e) => setEditDraft({ ...editDraft, hsn: e.target.value })} /></td>
              <td className="r muted">{tc.rates[0]?.ratePct ?? '—'}%</td>
              <td style={{ display: 'flex', gap: 6 }}>
                <button type="button" className="btn p" onClick={() => saveEdit(tc.id)}>Save</button>
                <button type="button" className="btn" onClick={() => setEditingId(null)}>Cancel</button>
              </td>
            </tr>
          ) : (
            <tr key={tc.id}>
              <td>{tc.name}</td>
              <td className="muted">{tc.hsn ?? '—'}</td>
              <td className="r">{tc.rates[0]?.ratePct ?? '—'}%</td>
              <td><button type="button" className="btn" onClick={() => startEdit(tc)}>Edit</button></td>
            </tr>
          ))}
          {classes.length === 0 && <tr><td colSpan={4} className="muted" style={{ textAlign: 'center', padding: 14 }}>No tax classes yet</td></tr>}
        </tbody>
      </table>
      <form onSubmit={addClass} style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr auto', gap: 8, padding: '12px 12px 6px' }}>
        <input className="in" placeholder="Category name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
        <input className="in" placeholder="HSN code" value={form.hsn} onChange={(e) => setForm({ ...form, hsn: e.target.value })} />
        <button type="submit" className="btn">Add class</button>
      </form>
      <form onSubmit={addRate} style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr 1fr auto', gap: 8, padding: '6px 12px 12px' }}>
        <select className="in" value={rateForm.taxClassId} onChange={(e) => setRateForm({ ...rateForm, taxClassId: e.target.value })} required>
          <option value="">Add rate to…</option>
          {classes.map((tc) => <option key={tc.id} value={tc.id}>{tc.name}</option>)}
        </select>
        <input className="in" placeholder="Rate %" type="number" step="0.01" value={rateForm.ratePct} onChange={(e) => setRateForm({ ...rateForm, ratePct: e.target.value })} required />
        <input className="in" type="date" value={rateForm.effectiveFrom} onChange={(e) => setRateForm({ ...rateForm, effectiveFrom: e.target.value })} required />
        <button type="submit" className="btn p">Add rate</button>
      </form>
      <div className="muted" style={{ padding: '0 16px 12px', fontSize: 12.5 }}>Name/HSN can be edited any time. Rates can't be edited once added (effective-dated history) — add a new one instead, it never changes past bills.</div>
    </div>
  );
}

// ---------- Document series ----------

interface Series { id: string; prefix: string; nextNo: number }

function DocumentSeriesCard() {
  const [series, setSeries] = useState<Series[]>([]);
  const sortable = useTableSort(series, {
    prefix: (s) => s.prefix,
    nextNo: (s) => s.nextNo,
  });
  const [form, setForm] = useState({ prefix: '', nextNo: '1' });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editNextNo, setEditNextNo] = useState('');
  const [error, setError] = useState<string | null>(null);

  function load() { api.get<Series[]>('/document-series').then(setSeries); }
  useEffect(load, []);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await api.post('/document-series', { prefix: form.prefix, nextNo: Number(form.nextNo) });
      setForm({ prefix: '', nextNo: '1' });
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save series');
    }
  }

  function startEdit(s: Series) {
    setEditingId(s.id);
    setEditNextNo(String(s.nextNo));
    setError(null);
  }

  async function saveEdit(id: string) {
    setError(null);
    try {
      await api.patch(`/document-series/${id}`, { nextNo: Number(editNextNo) });
      setEditingId(null);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save changes');
    }
  }

  return (
    <div className="card" style={{ overflow: 'hidden' }}>
      <div style={{ padding: '12px 16px', fontWeight: 700, borderBottom: '1px solid var(--border-light)' }}>Document series</div>
      <ErrorLine error={error} />
      <table className="tbl">
        <thead>
          <tr>
            <SortTh label="Prefix" sortKey="prefix" sort={sortable.sort} onSort={sortable.toggle} />
            <SortTh label="Next no." sortKey="nextNo" align="r" sort={sortable.sort} onSort={sortable.toggle} />
            <th></th>
          </tr>
        </thead>
        <tbody>
          {sortable.rows.map((s) => (
            <tr key={s.id}>
              <td>{s.prefix}</td>
              <td className="r">
                {editingId === s.id ? (
                  <input className="in" style={{ width: 100, textAlign: 'right' }} type="number" value={editNextNo} onChange={(e) => setEditNextNo(e.target.value)} />
                ) : (
                  String(s.nextNo).padStart(6, '0')
                )}
              </td>
              <td>
                {editingId === s.id ? (
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button type="button" className="btn p" onClick={() => saveEdit(s.id)}>Save</button>
                    <button type="button" className="btn" onClick={() => setEditingId(null)}>Cancel</button>
                  </div>
                ) : (
                  <button type="button" className="btn" onClick={() => startEdit(s)}>Edit</button>
                )}
              </td>
            </tr>
          ))}
          {series.length === 0 && <tr><td colSpan={3} className="muted" style={{ textAlign: 'center', padding: 14 }}>No series yet — add MK-, WH-, INV-, CN-</td></tr>}
        </tbody>
      </table>
      <form onSubmit={add} style={{ display: 'flex', gap: 8, padding: 12 }}>
        <input className="in" placeholder="Prefix, e.g. MK-" value={form.prefix} onChange={(e) => setForm({ ...form, prefix: e.target.value })} required />
        <input className="in" style={{ width: 120 }} placeholder="Next no." type="number" value={form.nextNo} onChange={(e) => setForm({ ...form, nextNo: e.target.value })} required />
        <button type="submit" className="btn p">Add series</button>
      </form>
      <div className="muted" style={{ padding: '0 12px 12px', fontSize: 12.5 }}>Only the next number can be corrected after setup — the prefix is wired into the sale code, so it can't be renamed here.</div>
    </div>
  );
}

// ---------- Users ----------

interface UserRow { id: string; name: string; email: string; roles: Role[]; active: boolean }

function UsersCard() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const sortable = useTableSort(users, {
    name: (u) => u.name,
    email: (u) => u.email,
    roles: (u) => u.roles.join(', '),
    status: (u) => (u.active ? 'Active' : 'Inactive'),
  });
  const [form, setForm] = useState<{ name: string; email: string; password: string; roles: Role[] }>({ name: '', email: '', password: '', roles: [] });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<{ name: string; roles: Role[]; password: string }>({ name: '', roles: [], password: '' });
  const [error, setError] = useState<string | null>(null);

  function load() { api.get<UserRow[]>('/users').then(setUsers); }
  useEffect(load, []);

  function toggleRole(role: Role) {
    setForm((f) => ({ ...f, roles: f.roles.includes(role) ? f.roles.filter((r) => r !== role) : [...f.roles, role] }));
  }

  function toggleEditRole(role: Role) {
    setEditDraft((f) => ({ ...f, roles: f.roles.includes(role) ? f.roles.filter((r) => r !== role) : [...f.roles, role] }));
  }

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await api.post('/users', form);
      setForm({ name: '', email: '', password: '', roles: [] });
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save user');
    }
  }

  function startEdit(u: UserRow) {
    setEditingId(u.id);
    setEditDraft({ name: u.name, roles: u.roles, password: '' });
    setError(null);
  }

  async function saveEdit(id: string) {
    setError(null);
    try {
      await api.patch(`/users/${id}`, {
        name: editDraft.name,
        roles: editDraft.roles,
        password: editDraft.password || undefined,
      });
      setEditingId(null);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save changes');
    }
  }

  async function toggleActive(u: UserRow) {
    setError(null);
    try {
      await api.patch(`/users/${u.id}`, { active: !u.active });
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not update user');
    }
  }

  return (
    <div className="card" style={{ overflow: 'hidden' }}>
      <div style={{ padding: '12px 16px', fontWeight: 700, borderBottom: '1px solid var(--border-light)' }}>Users</div>
      <ErrorLine error={error} />
      <table className="tbl">
        <thead>
          <tr>
            <SortTh label="Name" sortKey="name" sort={sortable.sort} onSort={sortable.toggle} />
            <SortTh label="Email" sortKey="email" sort={sortable.sort} onSort={sortable.toggle} />
            <SortTh label="Roles" sortKey="roles" sort={sortable.sort} onSort={sortable.toggle} />
            <SortTh label="Status" sortKey="status" sort={sortable.sort} onSort={sortable.toggle} />
            <th></th>
          </tr>
        </thead>
        <tbody>
          {sortable.rows.map((u) => editingId === u.id ? (
            <tr key={u.id}>
              <td><input className="in" value={editDraft.name} onChange={(e) => setEditDraft({ ...editDraft, name: e.target.value })} /></td>
              <td className="muted">{u.email}</td>
              <td>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  {ALL_ROLES.map((role) => (
                    <label key={role} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12.5 }}>
                      <input type="checkbox" checked={editDraft.roles.includes(role)} onChange={() => toggleEditRole(role)} />
                      {role}
                    </label>
                  ))}
                </div>
                <input className="in" style={{ marginTop: 6 }} type="password" placeholder="New password (leave blank to keep)" value={editDraft.password} onChange={(e) => setEditDraft({ ...editDraft, password: e.target.value })} />
              </td>
              <td><span className={`pill ${u.active ? 'g' : 'n'}`}>{u.active ? 'Active' : 'Inactive'}</span></td>
              <td style={{ display: 'flex', gap: 6 }}>
                <button type="button" className="btn p" onClick={() => saveEdit(u.id)}>Save</button>
                <button type="button" className="btn" onClick={() => setEditingId(null)}>Cancel</button>
              </td>
            </tr>
          ) : (
            <tr key={u.id}>
              <td>{u.name}</td>
              <td className="muted">{u.email}</td>
              <td>{u.roles.map((r) => <span key={r} className="pill b" style={{ marginRight: 4 }}>{r}</span>)}</td>
              <td><span className={`pill ${u.active ? 'g' : 'n'}`}>{u.active ? 'Active' : 'Inactive'}</span></td>
              <td style={{ display: 'flex', gap: 6 }}>
                <button type="button" className="btn" onClick={() => startEdit(u)}>Edit</button>
                <button type="button" className="btn" onClick={() => toggleActive(u)}>{u.active ? 'Deactivate' : 'Activate'}</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <form onSubmit={add} style={{ padding: 12, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto', gap: 8, alignItems: 'end' }}>
        <input className="in" placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
        <input className="in" placeholder="Email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
        <input className="in" placeholder="Password (min 8 chars)" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required />
        <button type="submit" className="btn p">Add user</button>
        <div style={{ gridColumn: 'span 4', display: 'flex', gap: 14 }}>
          {ALL_ROLES.map((role) => (
            <label key={role} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13.5 }}>
              <input type="checkbox" checked={form.roles.includes(role)} onChange={() => toggleRole(role)} />
              {role}
            </label>
          ))}
        </div>
      </form>
      <div className="muted" style={{ padding: '0 12px 12px', fontSize: 12.5 }}>Roles are combinable — about 5 users expected in total. Email can't be changed after creation; deactivate and add a new account instead.</div>
    </div>
  );
}

interface CategoryRow { id: string; name: string; active: boolean }

// Product categories (Rice, Atta, Ghee ...). Items pick one of these.
function CategoriesCard() {
  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);

  function load() {
    api.get<CategoryRow[]>('/categories').then(setCategories);
  }
  useEffect(load, []);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await api.post('/categories', { name: name.trim() });
      setName('');
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not add category');
    }
  }

  async function toggle(c: CategoryRow) {
    setError(null);
    try {
      await api.patch(`/categories/${c.id}`, { active: !c.active });
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not update category');
    }
  }

  return (
    <div className="card" style={{ overflow: 'hidden' }}>
      <div style={{ padding: '12px 16px', fontWeight: 700, borderBottom: '1px solid var(--border-light)' }}>Product categories</div>
      <ErrorLine error={error} />
      <form onSubmit={add} style={{ display: 'flex', gap: 8, padding: 12 }}>
        <input className="in" style={{ flex: 1, minWidth: 0 }} placeholder="Category name, e.g. Rice" value={name} onChange={(e) => setName(e.target.value)} required />
        <button type="submit" className="btn p" disabled={!name.trim()}>Add</button>
      </form>
      <table className="tbl">
        <thead><tr><th>Category</th><th>Status</th><th></th></tr></thead>
        <tbody>
          {categories.map((c) => (
            <tr key={c.id}>
              <td>{c.name}</td>
              <td><span className={`pill ${c.active ? 'g' : 'n'}`}>{c.active ? 'Active' : 'Inactive'}</span></td>
              <td><button type="button" className="btn" onClick={() => toggle(c)}>{c.active ? 'Deactivate' : 'Activate'}</button></td>
            </tr>
          ))}
          {categories.length === 0 && (
            <tr><td colSpan={3} className="muted" style={{ padding: 16, textAlign: 'center' }}>No categories yet</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

export function SettingsPage() {
  return (
    <>
      <div className="top">
        <h1>Settings</h1>
        <span className="muted" style={{ fontSize: 13 }}>Admin only · changes are logged</span>
      </div>
      <div className="body" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, alignContent: 'start', overflow: 'auto' }}>
        <div style={{ gridColumn: 'span 2' }}><BusinessProfileCard /></div>
        <ChannelDiscountsCard />
        <ZonesCard />
        <TaxClassesCard />
        <CategoriesCard />
        <DocumentSeriesCard />
        <div style={{ gridColumn: 'span 2' }}><UsersCard /></div>
      </div>
    </>
  );
}
