import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import type { Channel } from '@farm-sales/shared';
import { api, ApiError } from '../lib/api.js';
import { formatPaise } from '../lib/format.js';
import { Link } from 'react-router-dom';
import { Field, Modal, Notice, SectionCard, StatusPill, Switch } from '../components/ui.js';
import { Icon } from '../components/Icon.js';
import { MenuAccessSettings } from '../components/MenuAccessSettings.js';

// Settings is one page with a menu on the left. Each item is one job, so nothing is buried.
// Staff accounts live on their own page, Users, and are linked from the menu.

type SectionId = 'business' | 'channels' | 'categories' | 'zones' | 'tax' | 'menu' | 'billing';

const sections: { id: SectionId; label: string; help: string; icon: string }[] = [
  { id: 'business', label: 'Business Profile', help: 'Name, address and printed details', icon: 'store' },
  { id: 'channels', label: 'Channels & Discounts', help: 'How much a cashier may discount', icon: 'percent' },
  { id: 'categories', label: 'Product Categories', help: 'Rice, Atta, Ghee and so on', icon: 'tag' },
  { id: 'zones', label: 'Delivery Zones', help: 'Pincodes and delivery fees', icon: 'truck' },
  { id: 'tax', label: 'Tax Classes & GST', help: 'Rates by product class', icon: 'file' },
  { id: 'menu', label: 'Menu Access', help: 'Which sidebar pages each role sees', icon: 'menu' },
  { id: 'billing', label: 'Bill Numbers', help: 'Prefix and next number', icon: 'hash' },
];

const danger = '#B42318';

// Pulls the first message of a failed request, or a fallback.
function errorText(err: unknown, fallback: string): string {
  return err instanceof ApiError ? err.message : fallback;
}

// Shared look for a list table inside a section card.
function Table({ head, children, empty }: { head: ReactNode[]; children: ReactNode; empty?: string }) {
  return (
    <div style={{ overflow: 'auto', margin: '-20px -20px 0' }}>
      <table className="tbl">
        <thead>
          <tr>{head.map((h, i) => <th key={i}>{h}</th>)}</tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
      {empty && <div className="muted" style={{ padding: 24, textAlign: 'center' }}>{empty}</div>}
    </div>
  );
}

// Title, a line of description, and an optional action on the right (such as Save Changes).
function SectionHeader({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
      <div>
        <h2 style={{ margin: 0, fontSize: 22 }}>{title}</h2>
        {description && <div className="muted" style={{ fontSize: 13.5, marginTop: 2 }}>{description}</div>}
      </div>
      {action}
    </div>
  );
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
  showLogoOnBills: boolean;
  showGstinOnBills: boolean;
}

// The text fields of the form. The two print options are switches, so they are kept apart.
type TextKey = 'name' | 'address' | 'gstin' | 'fssaiNumber' | 'phone' | 'email' | 'logoUrl' | 'upiId' | 'upiQrImageUrl';
interface BusinessForm extends Record<TextKey, string> {
  showLogoOnBills: boolean;
  showGstinOnBills: boolean;
}

const emptyBusiness: BusinessForm = { name: '', address: '', gstin: '', fssaiNumber: '', phone: '', email: '', logoUrl: '', upiId: '', upiQrImageUrl: '', showLogoOnBills: true, showGstinOnBills: true };

function isWebAddress(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}

function businessErrors(f: BusinessForm): Partial<Record<TextKey, string>> {
  const e: Partial<Record<TextKey, string>> = {};
  if (f.name.trim().length < 2) e.name = 'Enter the business name';
  if (f.phone && !/^[6-9]\d{9}$/.test(f.phone)) e.phone = 'Enter a 10-digit mobile number';
  if (f.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email)) e.email = 'Enter a valid email address';
  if (f.gstin && !/^[0-9A-Z]{15}$/.test(f.gstin)) e.gstin = 'GSTIN is 15 characters: capital letters and digits';
  if (f.fssaiNumber && !/^\d+$/.test(f.fssaiNumber)) e.fssaiNumber = 'Use digits only';
  if (f.upiId && !/^[\w.-]{2,256}@[A-Za-z]{2,64}$/.test(f.upiId)) e.upiId = 'Enter a UPI ID, for example name@bank';
  if (f.logoUrl && !f.logoUrl.startsWith('data:image/') && !isWebAddress(f.logoUrl)) e.logoUrl = 'Upload a PNG, JPEG or WebP image';
  if (f.upiQrImageUrl && !/^data:image\/(png|jpeg|webp);base64,/.test(f.upiQrImageUrl) && !isWebAddress(f.upiQrImageUrl)) e.upiQrImageUrl = 'Upload a PNG, JPEG or WebP image';
  return e;
}

// An image picked from this computer (PNG, JPEG or WebP, up to 300 KB), kept as a data address.
const IMAGE_MAX_BYTES = 300 * 1024;
function ImageUpload({ title, hint, alt, value, onChange, error }: { title?: string; hint?: string; alt: string; value: string; onChange: (next: string) => void; error?: string }) {
  const [localError, setLocalError] = useState<string | null>(null);

  async function pick(file: File) {
    setLocalError(null);
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
      setLocalError('Use a PNG, JPEG or WebP image');
      return;
    }
    if (file.size > IMAGE_MAX_BYTES) {
      setLocalError('This image is larger than 300 KB. Save a smaller copy and try again.');
      return;
    }
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
    onChange(dataUrl);
  }

  const message = localError ?? error;
  return (
    <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 18, alignItems: 'center', flexWrap: 'wrap' }}>
      <div style={{ width: 150, height: 150, flex: 'none', border: '1px dashed #C9D2C8', borderRadius: 12, background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
        {value ? (
          <img src={value} alt={alt} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
        ) : (
          <span className="muted" style={{ fontSize: 12.5, textAlign: 'center', padding: 10 }}>No image yet</span>
        )}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-start', minWidth: 0, flex: 1 }}>
        {title && <div className="lbl" style={{ margin: 0 }}>{title}</div>}
        <label className="btn p" style={{ minHeight: 44, display: 'inline-flex', alignItems: 'center', padding: '0 18px', cursor: 'pointer' }}>
          Upload Image
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            style={{ display: 'none' }}
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (file) void pick(file);
            }}
          />
        </label>
        {value && (
          <button type="button" className="btn" style={{ minHeight: 44 }} onClick={() => { setLocalError(null); onChange(''); }}>
            Remove
          </button>
        )}
        {hint && <div className="muted" style={{ fontSize: 12.5 }}>{hint}</div>}
        {message && <div role="alert" className="field-error">{message}</div>}
      </div>
    </div>
  );
}

function BusinessSection() {
  const [form, setForm] = useState<BusinessForm>(emptyBusiness);
  const [loaded, setLoaded] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ kind: 'error' | 'success'; text: string } | null>(null);

  useEffect(() => {
    api.get<BusinessProfile>('/business-profile').then((p) => {
      setForm({
        name: p.name ?? '',
        address: p.address ?? '',
        gstin: p.gstin ?? '',
        fssaiNumber: p.fssaiNumber ?? '',
        phone: p.phone ?? '',
        email: p.email ?? '',
        logoUrl: p.logoUrl ?? '',
        upiId: p.upiId ?? '',
        upiQrImageUrl: p.upiQrImageUrl ?? '',
        showLogoOnBills: p.showLogoOnBills,
        showGstinOnBills: p.showGstinOnBills,
      });
      setLoaded(true);
    }).catch((err) => setMessage({ kind: 'error', text: errorText(err, 'Could not load the business profile') }));
  }, []);

  const errors = businessErrors(form);
  const shown = (k: TextKey) => (submitted ? errors[k] : undefined);
  const set = (k: TextKey, v: string) => {
    setMessage(null);
    setForm((f) => ({ ...f, [k]: v }));
  };
  const setSwitch = (k: 'showLogoOnBills' | 'showGstinOnBills', v: boolean) => {
    setMessage(null);
    setForm((f) => ({ ...f, [k]: v }));
  };

  async function save() {
    setSubmitted(true);
    setMessage(null);
    if (Object.keys(errors).length > 0) {
      setMessage({ kind: 'error', text: 'Check the highlighted fields.' });
      return;
    }
    setSaving(true);
    try {
      const pick = (v: string) => v.trim() || undefined;
      await api.patch('/business-profile', {
        name: form.name.trim(),
        address: pick(form.address),
        gstin: pick(form.gstin),
        fssaiNumber: pick(form.fssaiNumber),
        phone: pick(form.phone),
        email: pick(form.email),
        // Removing the logo sends null.
        logoUrl: form.logoUrl.trim() ? form.logoUrl : null,
        upiId: pick(form.upiId),
        // Removing the image sends null, so the saved QR is cleared.
        upiQrImageUrl: form.upiQrImageUrl.trim() ? form.upiQrImageUrl : null,
        showLogoOnBills: form.showLogoOnBills,
        showGstinOnBills: form.showGstinOnBills,
      });
      setMessage({ kind: 'success', text: 'Saved. Printed bills use these details from now on.' });
    } catch (err) {
      setMessage({ kind: 'error', text: errorText(err, 'Could not save the business profile') });
    } finally {
      setSaving(false);
    }
  }

  const input = (k: TextKey, label: string, opts: { required?: boolean; hint?: string; type?: string; placeholder?: string; wide?: boolean; multiline?: boolean } = {}) => (
    <Field label={label} required={opts.required} error={shown(k)} hint={opts.hint} style={opts.wide ? { gridColumn: '1 / -1' } : undefined}>
      {({ id, invalid }) =>
        opts.multiline ? (
          <textarea id={id} className="in" style={{ height: 72, paddingTop: 8, resize: 'vertical' }} value={form[k]} aria-invalid={invalid} onChange={(e) => set(k, e.target.value)} />
        ) : (
          <input id={id} type={opts.type ?? 'text'} className="in" placeholder={opts.placeholder} value={form[k]} aria-invalid={invalid} onChange={(e) => set(k, e.target.value)} />
        )
      }
    </Field>
  );

  if (!loaded && !message) return <div className="muted">Loading…</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Save Changes sits top right, and saves the whole profile at once. */}
      <SectionHeader
        title="Business Profile"
        description="Name, address and printed details"
        action={
          <button type="button" className="btn p" style={{ minHeight: 44, padding: '0 24px' }} disabled={saving || !loaded} onClick={() => void save()}>
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        }
      />
      {message && <Notice kind={message.kind}>{message.text}</Notice>}

      <SectionCard title="Company logo" description="Shown in the sidebar and at the top of printed bills. PNG, JPEG or WebP, up to 300 KB.">
        <ImageUpload alt="Company logo" value={form.logoUrl} error={shown('logoUrl')} onChange={(v) => set('logoUrl', v)} />
      </SectionCard>

      <SectionCard title="Business details" description="Shown at the top of printed bills.">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 14 }}>
          {input('name', 'Business name', { required: true, wide: true })}
          {input('phone', 'Phone', { hint: '10 digits' })}
          {input('email', 'Email', { type: 'email' })}
          {input('address', 'Address', { wide: true, multiline: true })}
        </div>
      </SectionCard>

      <SectionCard title="Tax and licences" description="Leave blank what does not apply to you.">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 14 }}>
          {input('gstin', 'GSTIN', { hint: 'Printed on tax bills' })}
          {input('fssaiNumber', 'FSSAI licence number', { hint: 'Printed on labels and bills' })}
        </div>
      </SectionCard>

      <SectionCard title="Payments and branding" description="The UPI details customers pay to, and what appears on printed bills.">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 14 }}>
          {input('upiId', 'UPI ID', { placeholder: 'name@bank' })}
          <ImageUpload title="UPI QR code" alt="UPI QR code" hint="PNG, JPEG or WebP, up to 300 KB. Shown on the UPI payment screen and on the bill." value={form.upiQrImageUrl} error={shown('upiQrImageUrl')} onChange={(v) => set('upiQrImageUrl', v)} />
        </div>
        <div style={{ borderTop: '1px solid #E4EBE5', marginTop: 18, paddingTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
          <Switch checked={form.showLogoOnBills} onChange={(v) => setSwitch('showLogoOnBills', v)} label="Show logo on printed bills" />
          <Switch checked={form.showGstinOnBills} onChange={(v) => setSwitch('showGstinOnBills', v)} label="Show GSTIN on printed bills" />
        </div>
      </SectionCard>
    </div>
  );
}

// ---------- Channels and discounts ----------

interface ChannelDiscountRow { channel: Channel; defaultPct: string; maxPct: string }

// Every channel a sale or order can come from. Each needs a discount setting, or billing fails.
const channelList: { value: Channel; label: string }[] = [
  { value: 'WALK_IN', label: 'Walk-in' },
  { value: 'PHONE', label: 'Phone' },
  { value: 'ONLINE', label: 'Online and marketplaces' },
  { value: 'EMAIL', label: 'Email' },
  { value: 'SOCIAL', label: 'Social media' },
];

function ChannelsSection() {
  const [rows, setRows] = useState<Record<Channel, { defaultPct: string; maxPct: string }> | null>(null);
  const [saved, setSaved] = useState<Partial<Record<Channel, boolean>>>({});
  const [submitted, setSubmitted] = useState(false);
  const [message, setMessage] = useState<{ kind: 'error' | 'success'; text: string } | null>(null);
  const [saving, setSaving] = useState(false);

  function load() {
    api.get<ChannelDiscountRow[]>('/channel-discounts').then((data) => {
      setRows(Object.fromEntries(channelList.map(({ value }) => {
        const existing = data.find((d) => d.channel === value);
        return [value, { defaultPct: existing?.defaultPct ?? '0', maxPct: existing?.maxPct ?? '0' }];
      })) as Record<Channel, { defaultPct: string; maxPct: string }>);
    }).catch((err) => setMessage({ kind: 'error', text: errorText(err, 'Could not load discounts') }));
  }
  useEffect(load, []);

  function problem(channel: Channel): string | undefined {
    const r = rows?.[channel];
    if (!r) return undefined;
    const d = Number(r.defaultPct);
    const m = Number(r.maxPct);
    if (r.defaultPct.trim() === '' || r.maxPct.trim() === '') return 'Enter both numbers';
    if (!Number.isFinite(d) || !Number.isFinite(m) || d < 0 || m < 0 || m > 100) return 'Use 0 to 100';
    if (d > m) return 'The default cannot be more than the maximum';
    return undefined;
  }

  function set(channel: Channel, key: 'defaultPct' | 'maxPct', value: string) {
    setMessage(null);
    setSaved((s) => ({ ...s, [channel]: false }));
    setRows((r) => (r ? { ...r, [channel]: { ...r[channel], [key]: value } } : r));
  }

  async function saveAll() {
    setSubmitted(true);
    setMessage(null);
    if (!rows || channelList.some(({ value }) => problem(value))) {
      setMessage({ kind: 'error', text: 'Fix the highlighted numbers first.' });
      return;
    }
    setSaving(true);
    try {
      for (const { value } of channelList) {
        await api.post('/channel-discounts', { channel: value, defaultPct: Number(rows[value].defaultPct), maxPct: Number(rows[value].maxPct) });
      }
      setSaved(Object.fromEntries(channelList.map(({ value }) => [value, true])));
      setMessage({ kind: 'success', text: 'Saved. Cashiers now see these limits.' });
    } catch (err) {
      setMessage({ kind: 'error', text: errorText(err, 'Could not save discounts') });
    } finally {
      setSaving(false);
    }
  }

  return (
    <SectionCard
      title="Channels and discounts"
      description="The default is filled in when a bill starts. A cashier can change it up to the maximum, and the server refuses anything above it."
      footer={
        <>
          <button type="button" className="btn p" style={{ minHeight: 44, padding: '0 20px' }} disabled={saving || !rows} onClick={() => void saveAll()}>
            {saving ? 'Saving…' : 'Save all'}
          </button>
          {message && <span style={{ fontSize: 13.5, color: message.kind === 'error' ? danger : '#14502F', fontWeight: 600 }}>{message.text}</span>}
        </>
      }
    >
      {!rows ? <div className="muted">Loading…</div> : (
        <Table head={['Channel', 'Default discount %', 'Cashier maximum %', 'Check']}>
          {channelList.map(({ value, label }) => {
            const error = submitted || rows[value] ? problem(value) : undefined;
            return (
              <tr key={value}>
                <td><strong>{label}</strong></td>
                <td style={{ width: 180 }}>
                  <input className="in" inputMode="decimal" aria-label={`${label} default discount`} aria-invalid={!!error} style={{ textAlign: 'right' }} value={rows[value].defaultPct} onChange={(e) => set(value, 'defaultPct', e.target.value)} />
                </td>
                <td style={{ width: 180 }}>
                  <input className="in" inputMode="decimal" aria-label={`${label} maximum discount`} aria-invalid={!!error} style={{ textAlign: 'right' }} value={rows[value].maxPct} onChange={(e) => set(value, 'maxPct', e.target.value)} />
                </td>
                <td>
                  {error ? <span style={{ color: danger, fontSize: 12.5 }}>{error}</span> : saved[value] ? <StatusPill tone="green">Saved</StatusPill> : <span className="muted" style={{ fontSize: 12.5 }}>OK</span>}
                </td>
              </tr>
            );
          })}
        </Table>
      )}
    </SectionCard>
  );
}

// ---------- Delivery zones ----------

interface Zone { id: string; name: string; pincodes: string | null; feePaise: number; freeFromPaise: number; active: boolean }

function parsePincodes(text: string): string[] {
  return text.split(/[,\s]+/).map((p) => p.trim()).filter(Boolean);
}

function ZonesSection() {
  const [zones, setZones] = useState<Zone[] | null>(null);
  const [message, setMessage] = useState<{ kind: 'error' | 'success'; text: string } | null>(null);
  const [editor, setEditor] = useState<{ mode: 'create' } | { mode: 'edit'; zone: Zone } | null>(null);

  function load() {
    api.get<Zone[]>('/zones').then(setZones).catch((err) => setMessage({ kind: 'error', text: errorText(err, 'Could not load zones') }));
  }
  useEffect(load, []);

  async function toggle(z: Zone) {
    setMessage(null);
    try {
      await api.patch(`/zones/${z.id}`, { active: !z.active });
      load();
    } catch (err) {
      setMessage({ kind: 'error', text: errorText(err, 'Could not update the zone') });
    }
  }

  return (
    <>
      <SectionCard
        title="Delivery zones"
        description="A zone has the pincodes it covers and its delivery fee. An order's pincode picks its zone."
        action={<button type="button" className="btn p" style={{ minHeight: 40 }} onClick={() => setEditor({ mode: 'create' })}>Add zone</button>}
      >
        {message && <div style={{ marginBottom: 12 }}><Notice kind={message.kind}>{message.text}</Notice></div>}
        {!zones ? <div className="muted">Loading…</div> : (
          <Table head={['Zone', 'Pincodes', 'Delivery fee', 'Free above', 'Status', '']} empty={zones.length === 0 ? 'No zones yet. Add the areas you deliver to.' : undefined}>
            {zones.map((z) => (
              <tr key={z.id}>
                <td><strong>{z.name}</strong></td>
                <td className="muted" style={{ maxWidth: 260 }}>{z.pincodes ? parsePincodes(z.pincodes).join(', ') : 'No pincodes yet'}</td>
                <td className="r">{formatPaise(z.feePaise)}</td>
                <td className="r">{z.freeFromPaise > 0 ? formatPaise(z.freeFromPaise) : 'Never free'}</td>
                <td><StatusPill tone={z.active ? 'green' : 'grey'}>{z.active ? 'Active' : 'Off'}</StatusPill></td>
                <td style={{ whiteSpace: 'nowrap', textAlign: 'right' }}>
                  <button type="button" className="btn" style={{ minHeight: 36, marginRight: 6 }} onClick={() => setEditor({ mode: 'edit', zone: z })}>Edit</button>
                  <button type="button" className="btn" style={{ minHeight: 36 }} onClick={() => void toggle(z)}>{z.active ? 'Turn off' : 'Turn on'}</button>
                </td>
              </tr>
            ))}
          </Table>
        )}
      </SectionCard>
      {editor && (
        <ZoneEditor
          zone={editor.mode === 'edit' ? editor.zone : undefined}
          existing={zones ?? []}
          onClose={() => setEditor(null)}
          onSaved={(text) => {
            setEditor(null);
            setMessage({ kind: 'success', text });
            load();
          }}
        />
      )}
    </>
  );
}

function ZoneEditor({ zone, existing, onClose, onSaved }: { zone?: Zone; existing: Zone[]; onClose: () => void; onSaved: (text: string) => void }) {
  const [name, setName] = useState(zone?.name ?? '');
  const [pincodes, setPincodes] = useState(zone?.pincodes ?? '');
  const [fee, setFee] = useState(zone ? (zone.feePaise / 100).toFixed(2) : '');
  const [freeFrom, setFreeFrom] = useState(zone ? (zone.freeFromPaise / 100).toFixed(2) : '');
  const [active, setActive] = useState(zone?.active ?? true);
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const list = parsePincodes(pincodes);
  const errors: Partial<Record<'name' | 'pincodes' | 'fee' | 'freeFrom', string>> = {};
  if (name.trim().length < 2) errors.name = 'Enter the zone name';
  if (existing.some((z) => z.id !== zone?.id && z.name.toLowerCase() === name.trim().toLowerCase())) errors.name = 'Another zone already has this name';
  const badPin = list.find((p) => !/^[1-9]\d{5}$/.test(p));
  if (badPin) errors.pincodes = `"${badPin}" is not a 6-digit pincode`;
  if (fee.trim() === '' || !Number.isFinite(Number(fee)) || Number(fee) < 0) errors.fee = 'Enter the fee, 0 or more';
  if (freeFrom.trim() === '' || !Number.isFinite(Number(freeFrom)) || Number(freeFrom) < 0) errors.freeFrom = 'Enter the amount, 0 for never free';
  const shown = (k: keyof typeof errors) => (submitted ? errors[k] : undefined);

  async function save() {
    setSubmitted(true);
    setSaveError(null);
    if (Object.keys(errors).length > 0) return;
    setSaving(true);
    const body = {
      name: name.trim(),
      pincodes: list.length ? list.join(', ') : undefined,
      feePaise: Math.round(Number(fee) * 100),
      freeFromPaise: Math.round(Number(freeFrom) * 100),
    };
    try {
      if (zone) await api.patch(`/zones/${zone.id}`, { ...body, active });
      else await api.post('/zones', body);
      onSaved(zone ? `${name.trim()} was updated.` : `${name.trim()} was added.`);
    } catch (err) {
      setSaveError(errorText(err, 'Could not save the zone'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      title={zone ? `Edit ${zone.name}` : 'Add a delivery zone'}
      subtitle="Orders whose pincode is in this list use this zone and its fee."
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn" style={{ minHeight: 44 }} onClick={onClose}>Cancel</button>
          <button type="button" className="btn p" style={{ minHeight: 44 }} disabled={saving} onClick={() => void save()}>{saving ? 'Saving…' : 'Save zone'}</button>
        </>
      }
    >
      {saveError && <Notice kind="error">{saveError}</Notice>}
      <Field label="Zone name" required error={shown('name')}>
        {({ id, invalid }) => <input id={id} className="in" value={name} aria-invalid={invalid} onChange={(e) => setName(e.target.value)} />}
      </Field>
      <Field label="Pincodes" error={shown('pincodes')} hint="Separate with commas. Example: 400001, 400002">
        {({ id, invalid }) => <textarea id={id} className="in" style={{ height: 80, paddingTop: 8, resize: 'vertical' }} value={pincodes} aria-invalid={invalid} onChange={(e) => setPincodes(e.target.value)} />}
      </Field>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 14 }}>
        <Field label="Delivery fee (₹)" required error={shown('fee')}>
          {({ id, invalid }) => <input id={id} className="in" inputMode="decimal" value={fee} aria-invalid={invalid} onChange={(e) => setFee(e.target.value)} />}
        </Field>
        <Field label="Free delivery above (₹)" required error={shown('freeFrom')} hint="0 means the fee always applies">
          {({ id, invalid }) => <input id={id} className="in" inputMode="decimal" value={freeFrom} aria-invalid={invalid} onChange={(e) => setFreeFrom(e.target.value)} />}
        </Field>
      </div>
      {zone && <Switch checked={active} onChange={setActive} label="Zone is on" hint="A zone that is off is not offered for new deliveries." />}
    </Modal>
  );
}

// ---------- Tax classes and GST ----------

interface TaxRate { ratePct: string; effectiveFrom: string }
interface TaxClass { id: string; name: string; hsn: string | null; rates: TaxRate[] }

function TaxSection() {
  const [classes, setClasses] = useState<TaxClass[] | null>(null);
  const [message, setMessage] = useState<{ kind: 'error' | 'success'; text: string } | null>(null);
  const [editor, setEditor] = useState<{ mode: 'class' } | { mode: 'rate'; taxClass?: TaxClass } | null>(null);

  function load() {
    api.get<TaxClass[]>('/tax-classes').then(setClasses).catch((err) => setMessage({ kind: 'error', text: errorText(err, 'Could not load tax classes') }));
  }
  useEffect(load, []);

  return (
    <>
      <SectionCard
        title="Tax classes"
        description="Each product belongs to a tax class. The rate is effective-dated: a new rate applies from its date and never changes past bills."
        action={
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="btn" style={{ minHeight: 40 }} onClick={() => setEditor({ mode: 'class' })}>Add class</button>
            <button type="button" className="btn p" style={{ minHeight: 40 }} onClick={() => setEditor({ mode: 'rate' })}>Add rate</button>
          </div>
        }
      >
        {message && <div style={{ marginBottom: 12 }}><Notice kind={message.kind}>{message.text}</Notice></div>}
        {!classes ? <div className="muted">Loading…</div> : (
          <Table head={['Class', 'HSN code', 'Current GST', 'Rate history', '']} empty={classes.length === 0 ? 'No tax classes yet.' : undefined}>
            {classes.map((tc) => {
              const current = tc.rates[0];
              return (
                <tr key={tc.id}>
                  <td><strong>{tc.name}</strong></td>
                  <td className="muted">{tc.hsn ?? '—'}</td>
                  <td>{current ? `${current.ratePct}%` : <span className="muted">Not set</span>}</td>
                  <td className="muted" style={{ fontSize: 12.5 }}>
                    {tc.rates.length === 0 ? 'No rate yet' : tc.rates.map((r) => `${r.ratePct}% from ${r.effectiveFrom.slice(0, 10)}`).join(' · ')}
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <button type="button" className="btn" style={{ minHeight: 36 }} onClick={() => setEditor({ mode: 'rate', taxClass: tc })}>Add rate</button>
                  </td>
                </tr>
              );
            })}
          </Table>
        )}
      </SectionCard>
      {editor?.mode === 'class' && (
        <TaxClassEditor
          existing={classes ?? []}
          onClose={() => setEditor(null)}
          onSaved={(text) => { setEditor(null); setMessage({ kind: 'success', text }); load(); }}
        />
      )}
      {editor?.mode === 'rate' && (
        <TaxRateEditor
          classes={classes ?? []}
          initial={editor.taxClass}
          onClose={() => setEditor(null)}
          onSaved={(text) => { setEditor(null); setMessage({ kind: 'success', text }); load(); }}
        />
      )}
    </>
  );
}

function TaxClassEditor({ existing, onClose, onSaved }: { existing: TaxClass[]; onClose: () => void; onSaved: (text: string) => void }) {
  const [name, setName] = useState('');
  const [hsn, setHsn] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const errors: { name?: string; hsn?: string } = {};
  if (name.trim().length < 2) errors.name = 'Enter the class name';
  else if (existing.some((c) => c.name.toLowerCase() === name.trim().toLowerCase())) errors.name = 'This class already exists';
  if (hsn && !/^\d{4,8}$/.test(hsn.trim())) errors.hsn = 'HSN is 4 to 8 digits';

  async function save() {
    setSubmitted(true);
    setSaveError(null);
    if (errors.name || errors.hsn) return;
    setSaving(true);
    try {
      await api.post('/tax-classes', { name: name.trim(), hsn: hsn.trim() || undefined });
      onSaved(`${name.trim()} was added. Set its rate with Add rate.`);
    } catch (err) {
      setSaveError(errorText(err, 'Could not save the class'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      title="Add a tax class"
      subtitle="A group of products that share one GST rate."
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn" style={{ minHeight: 44 }} onClick={onClose}>Cancel</button>
          <button type="button" className="btn p" style={{ minHeight: 44 }} disabled={saving} onClick={() => void save()}>{saving ? 'Saving…' : 'Add class'}</button>
        </>
      }
    >
      {saveError && <Notice kind="error">{saveError}</Notice>}
      <Field label="Class name" required error={submitted ? errors.name : undefined} hint="For example: Grains, Ghee, Spices">
        {({ id, invalid }) => <input id={id} className="in" value={name} aria-invalid={invalid} onChange={(e) => setName(e.target.value)} />}
      </Field>
      <Field label="HSN code" error={submitted ? errors.hsn : undefined} hint="Optional. Digits only.">
        {({ id, invalid }) => <input id={id} className="in" inputMode="numeric" value={hsn} aria-invalid={invalid} onChange={(e) => setHsn(e.target.value)} />}
      </Field>
    </Modal>
  );
}

function TaxRateEditor({ classes, initial, onClose, onSaved }: { classes: TaxClass[]; initial?: TaxClass; onClose: () => void; onSaved: (text: string) => void }) {
  const [taxClassId, setTaxClassId] = useState(initial?.id ?? '');
  const [rate, setRate] = useState('');
  const [from, setFrom] = useState(new Date().toISOString().slice(0, 10));
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const errors: { taxClassId?: string; rate?: string; from?: string } = {};
  if (!taxClassId) errors.taxClassId = 'Choose the class';
  const r = Number(rate);
  if (rate.trim() === '' || !Number.isFinite(r) || r < 0 || r > 100) errors.rate = 'Enter a rate from 0 to 100';
  else if (!/^\d+(\.\d{1,2})?$/.test(rate.trim())) errors.rate = 'Up to two decimal places';
  if (!from) errors.from = 'Choose the date it starts';
  const selected = classes.find((c) => c.id === taxClassId);

  async function save() {
    setSubmitted(true);
    setSaveError(null);
    if (Object.keys(errors).length > 0) return;
    setSaving(true);
    try {
      await api.post(`/tax-classes/${taxClassId}/rates`, { ratePct: r, effectiveFrom: from });
      onSaved(`New rate of ${r}% saved for ${selected?.name ?? 'the class'} from ${from}.`);
    } catch (err) {
      setSaveError(errorText(err, 'Could not save the rate'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      title="Add a GST rate"
      subtitle="Rates can't be edited once added. To change one, add a new rate with the date it starts."
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn" style={{ minHeight: 44 }} onClick={onClose}>Cancel</button>
          <button type="button" className="btn p" style={{ minHeight: 44 }} disabled={saving} onClick={() => void save()}>{saving ? 'Saving…' : 'Save rate'}</button>
        </>
      }
    >
      {saveError && <Notice kind="error">{saveError}</Notice>}
      <Field label="Tax class" required error={submitted ? errors.taxClassId : undefined}>
        {({ id, invalid }) => (
          <select id={id} className="in" value={taxClassId} aria-invalid={invalid} onChange={(e) => setTaxClassId(e.target.value)}>
            <option value="">Choose a class</option>
            {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        )}
      </Field>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 14 }}>
        <Field label="GST rate (%)" required error={submitted ? errors.rate : undefined}>
          {({ id, invalid }) => <input id={id} className="in" inputMode="decimal" value={rate} aria-invalid={invalid} onChange={(e) => setRate(e.target.value)} />}
        </Field>
        <Field label="Applies from" required error={submitted ? errors.from : undefined}>
          {({ id, invalid }) => <input id={id} type="date" className="in" value={from} aria-invalid={invalid} onChange={(e) => setFrom(e.target.value)} />}
        </Field>
      </div>
    </Modal>
  );
}

// ---------- Product categories ----------

interface CategoryRow { id: string; name: string; active: boolean }

function CategoriesSection() {
  const [categories, setCategories] = useState<CategoryRow[] | null>(null);
  const [name, setName] = useState('');
  const [message, setMessage] = useState<{ kind: 'error' | 'success'; text: string } | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const trimmed = name.trim();
  const nameError = trimmed.length < 2 ? 'Enter at least 2 letters' : trimmed.length > 40 ? 'At most 40 characters' : undefined;

  function load() {
    api.get<CategoryRow[]>('/categories').then(setCategories).catch((err) => setMessage({ kind: 'error', text: errorText(err, 'Could not load categories') }));
  }
  useEffect(load, []);

  async function add() {
    setSubmitted(true);
    setMessage(null);
    if (nameError) return;
    try {
      await api.post('/categories', { name: trimmed });
      setName('');
      setSubmitted(false);
      setMessage({ kind: 'success', text: `${trimmed} was added.` });
      load();
    } catch (err) {
      setMessage({ kind: 'error', text: errorText(err, 'Could not add the category') });
    }
  }

  async function toggle(c: CategoryRow) {
    setMessage(null);
    try {
      await api.patch(`/categories/${c.id}`, { active: !c.active });
      load();
    } catch (err) {
      setMessage({ kind: 'error', text: errorText(err, 'Could not update the category') });
    }
  }

  return (
    <SectionCard title="Product categories" description="Items are grouped under these. Switch one off to hide it when adding items; existing items keep it.">
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 14 }}>
        <div style={{ flex: 1 }}>
          <Field label="New category" error={submitted ? nameError : undefined}>
            {({ id, invalid }) => (
              <input id={id} className="in" value={name} maxLength={40} placeholder="For example: Rice" aria-invalid={invalid}
                onChange={(e) => { setMessage(null); setName(e.target.value); }}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void add(); } }} />
            )}
          </Field>
        </div>
        <button type="button" className="btn p" style={{ minHeight: 40, marginTop: 24 }} onClick={() => void add()}>Add category</button>
      </div>
      {message && <div style={{ marginBottom: 12 }}><Notice kind={message.kind}>{message.text}</Notice></div>}
      {!categories ? <div className="muted">Loading…</div> : (
        <Table head={['Category', 'Status', '']} empty={categories.length === 0 ? 'No categories yet.' : undefined}>
          {categories.map((c) => (
            <tr key={c.id}>
              <td><strong>{c.name}</strong></td>
              <td><StatusPill tone={c.active ? 'green' : 'grey'}>{c.active ? 'Shown' : 'Hidden'}</StatusPill></td>
              <td style={{ textAlign: 'right' }}><button type="button" className="btn" style={{ minHeight: 36 }} onClick={() => void toggle(c)}>{c.active ? 'Hide' : 'Show'}</button></td>
            </tr>
          ))}
        </Table>
      )}
    </SectionCard>
  );
}

// ---------- Bill numbers ----------

interface Series { id: string; prefix: string; nextNo: number }

function BillNumbersSection() {
  const [series, setSeries] = useState<Series[] | null>(null);
  const [message, setMessage] = useState<{ kind: 'error' | 'success'; text: string } | null>(null);
  const [editing, setEditing] = useState<Series | null>(null);

  function load() {
    api.get<Series[]>('/document-series').then(setSeries).catch((err) => setMessage({ kind: 'error', text: errorText(err, 'Could not load bill numbers') }));
  }
  useEffect(load, []);

  return (
    <>
      <SectionCard
        title="Bill numbers"
        description="The prefix starts each bill number, and the next number is the one the following bill gets. Only the next number can be changed here."
      >
        {message && <div style={{ marginBottom: 12 }}><Notice kind={message.kind}>{message.text}</Notice></div>}
        {!series ? <div className="muted">Loading…</div> : (
          <Table head={['Prefix', 'Next number', 'Example', '']} empty={series.length === 0 ? 'No series yet. Add MK- for market stall and WH- for the warehouse counter.' : undefined}>
            {series.map((s) => (
              <tr key={s.id}>
                <td><strong>{s.prefix}</strong></td>
                <td>{s.nextNo}</td>
                <td className="muted">{`${s.prefix}${String(s.nextNo).padStart(6, '0')}`}</td>
                <td style={{ textAlign: 'right' }}><button type="button" className="btn" style={{ minHeight: 36 }} onClick={() => setEditing(s)}>Change next number</button></td>
              </tr>
            ))}
          </Table>
        )}
      </SectionCard>
      {editing && (
        <NextNumberEditor
          series={editing}
          onClose={() => setEditing(null)}
          onSaved={(text) => { setEditing(null); setMessage({ kind: 'success', text }); load(); }}
        />
      )}
    </>
  );
}

function NextNumberEditor({ series, onClose, onSaved }: { series: Series; onClose: () => void; onSaved: (text: string) => void }) {
  const [value, setValue] = useState(String(series.nextNo));
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const n = Number(value);
  const error = !/^\d+$/.test(value.trim()) || n < 1 ? 'Enter a whole number, 1 or more' : undefined;

  async function save() {
    setSubmitted(true);
    setSaveError(null);
    if (error) return;
    setSaving(true);
    try {
      await api.patch(`/document-series/${series.id}`, { nextNo: n });
      onSaved(`${series.prefix} bills now continue from ${n}.`);
    } catch (err) {
      setSaveError(errorText(err, 'Could not save the number'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      title={`Next number for ${series.prefix}`}
      subtitle="Check this matches the last bill you issued on the old system. A number that was already used cannot be reused."
      onClose={onClose}
      width={460}
      footer={
        <>
          <button type="button" className="btn" style={{ minHeight: 44 }} onClick={onClose}>Cancel</button>
          <button type="button" className="btn p" style={{ minHeight: 44 }} disabled={saving} onClick={() => void save()}>{saving ? 'Saving…' : 'Save number'}</button>
        </>
      }
    >
      {saveError && <Notice kind="error">{saveError}</Notice>}
      <Field label="Next number" required error={submitted ? error : undefined}>
        {({ id, invalid }) => <input id={id} className="in" inputMode="numeric" value={value} aria-invalid={invalid} onChange={(e) => setValue(e.target.value.replace(/\D/g, ''))} />}
      </Field>
    </Modal>
  );
}

// ---------- Page ----------

// One row of the settings menu: an icon tile, a bold label and a line of help.
const menuRow = (on: boolean): CSSProperties => ({
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  width: '100%',
  minHeight: 60,
  padding: '10px 12px',
  borderRadius: 10,
  border: 0,
  cursor: 'pointer',
  textAlign: 'left',
  textDecoration: 'none',
  color: '#17261E',
  background: on ? '#E3F0E7' : 'transparent',
});
const menuTile: CSSProperties = { width: 38, height: 38, borderRadius: 10, background: '#EAF2EC', color: '#14502F', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' };

export function SettingsPage() {
  const [active, setActive] = useState<SectionId>('business');
  const current = sections.find((s) => s.id === active);

  return (
    <>
      <div className="top" style={{ gap: 12 }}>
        <div>
          <h1>Settings</h1>
          <div className="muted" style={{ fontSize: 12 }}>Owner only. Every change is recorded.</div>
        </div>
      </div>

      <div className="body" style={{ gap: 20, alignItems: 'flex-start' }}>
        <nav className="card" aria-label="Settings sections" style={{ width: 280, flex: 'none', padding: 10, position: 'sticky', top: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
          {sections.map((item) => {
            const on = item.id === active;
            return (
              <button key={item.id} type="button" aria-current={on ? 'page' : undefined} onClick={() => setActive(item.id)} style={menuRow(on)}>
                <span style={menuTile}><Icon name={item.icon} size={20} /></span>
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: 'block', fontWeight: 700, fontSize: 14.5 }}>{item.label}</span>
                  <span className="muted" style={{ display: 'block', fontSize: 12.5, marginTop: 2 }}>{item.help}</span>
                </span>
              </button>
            );
          })}
          <Link to="/users" style={menuRow(false)}>
            <span style={menuTile}><Icon name="users" size={20} /></span>
            <span style={{ minWidth: 0 }}>
              <span style={{ display: 'block', fontWeight: 700, fontSize: 14.5 }}>Staff Accounts</span>
              <span className="muted" style={{ display: 'block', fontSize: 12.5, marginTop: 2 }}>Add people, roles and access</span>
            </span>
          </Link>
        </nav>

        <main style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 16 }}>
          {active !== 'business' && active !== 'menu' && current && <SectionHeader title={current.label} description={current.help} />}
          {active === 'business' && <BusinessSection />}
          {active === 'menu' && <MenuAccessSettings />}
          {active === 'channels' && <ChannelsSection />}
          {active === 'zones' && <ZonesSection />}
          {active === 'tax' && <TaxSection />}
          {active === 'categories' && <CategoriesSection />}
          {active === 'billing' && <BillNumbersSection />}
        </main>
      </div>
    </>
  );
}
