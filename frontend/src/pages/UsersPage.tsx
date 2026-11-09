import { useEffect, useMemo, useState } from 'react';
import { createUserSchema, updateUserSchema, type Role } from '@farm-sales/shared';
import { api, ApiError } from '../lib/api.js';
import { formatDate } from '../lib/format.js';
import { useAuth } from '../lib/auth-context.js';
import { SortTh, useTableSort } from '../lib/table-sort.js';
import { Field, Modal, Notice, StatusPill, Switch } from '../components/ui.js';

interface UserRow {
  id: string;
  name: string;
  email: string;
  roles: Role[];
  active: boolean;
  createdAt: string;
}

const roleInfo: Record<Role, { label: string; help: string }> = {
  OWNER: { label: 'Owner', help: 'Everything: settings, customers, staff accounts and reports.' },
  CASHIER: { label: 'Cashier', help: 'Counter sales, held bills, returns and orders.' },
  WAREHOUSE: { label: 'Warehouse', help: 'Receiving stock, batches, packing, dispatch and stock counts.' },
  DELIVERY: { label: 'Delivery', help: 'Delivery screens: recording deliveries and cash collected.' },
};
const allRoles: Role[] = ['OWNER', 'CASHIER', 'WAREHOUSE', 'DELIVERY'];

interface UserForm {
  name: string;
  email: string;
  password: string;
  confirm: string;
  roles: Role[];
  active: boolean;
}

function formFrom(u?: UserRow): UserForm {
  return { name: u?.name ?? '', email: u?.email ?? '', password: '', confirm: '', roles: u?.roles ?? [], active: u?.active ?? true };
}

// Field problems. The shared schema is the rule book; the confirm box is checked here.
function formErrors(f: UserForm, mode: 'create' | 'edit'): Partial<Record<keyof UserForm, string>> {
  const errors: Partial<Record<keyof UserForm, string>> = {};
  if (f.roles.length === 0) errors.roles = 'Give the user at least one role';
  if (mode === 'create') {
    const parsed = createUserSchema.safeParse({ name: f.name.trim(), email: f.email.trim(), password: f.password, roles: f.roles });
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0]) as keyof UserForm;
        if (!errors[key]) errors[key] = issue.message === 'Invalid email' ? 'Enter a valid email address' : issue.message;
      }
    }
    if (!f.name.trim()) errors.name = 'Enter the name';
    if (f.password.length < 8) errors.password = 'Use at least 8 characters';
    if (f.confirm !== f.password) errors.confirm = 'The passwords do not match';
  } else {
    if (!f.name.trim()) errors.name = 'Enter the name';
    if (f.password) {
      if (f.password.length < 8) errors.password = 'Use at least 8 characters';
      if (f.confirm !== f.password) errors.confirm = 'The passwords do not match';
    }
    const parsed = updateUserSchema.safeParse({ name: f.name.trim(), roles: f.roles, active: f.active });
    if (!parsed.success && !errors.roles) errors.roles = parsed.error.issues[0]?.message;
  }
  return errors;
}

export function UsersPage() {
  const { user: me } = useAuth();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [editor, setEditor] = useState<{ mode: 'create' } | { mode: 'edit'; user: UserRow } | null>(null);

  async function load() {
    try {
      setUsers(await api.get<UserRow[]>('/users'));
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load users');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return users.filter((u) => !term || u.name.toLowerCase().includes(term) || u.email.toLowerCase().includes(term));
  }, [users, search]);

  const sortable = useTableSort(filtered, {
    name: (u: UserRow) => u.name,
    roles: (u: UserRow) => u.roles.join(', '),
    status: (u: UserRow) => (u.active ? 'Active' : 'Inactive'),
    added: (u: UserRow) => new Date(u.createdAt).getTime(),
  });

  const counts = useMemo(() => ({
    total: users.length,
    active: users.filter((u) => u.active).length,
    inactive: users.filter((u) => !u.active).length,
    owners: users.filter((u) => u.roles.includes('OWNER')).length,
  }), [users]);

  async function toggleActive(u: UserRow) {
    setError(null);
    setNotice(null);
    try {
      await api.patch(`/users/${u.id}`, { active: !u.active });
      setNotice(`${u.name} is now ${u.active ? 'inactive' : 'active'}.`);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not update the user');
    }
  }

  return (
    <>
      <div className="top" style={{ gap: 12 }}>
        <div>
          <h1>Users</h1>
          <div className="muted" style={{ fontSize: 12 }}>Staff accounts and what each one can use</div>
        </div>
        <div style={{ flex: 1 }} />
        <input className="in" style={{ width: 260 }} placeholder="Search name or email" aria-label="Search users" value={search} onChange={(e) => setSearch(e.target.value)} />
        <button className="btn p" style={{ minHeight: 40, whiteSpace: 'nowrap' }} onClick={() => setEditor({ mode: 'create' })}>Add user</button>
      </div>

      <div className="body" style={{ flexDirection: 'column', gap: 16 }}>
        {error && <Notice kind="error">{error}</Notice>}
        {notice && <Notice kind="success">{notice}</Notice>}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 12 }}>
          {[
            { label: 'Users', value: counts.total },
            { label: 'Active', value: counts.active },
            { label: 'Inactive', value: counts.inactive },
            { label: 'Owners', value: counts.owners },
          ].map((tile) => (
            <div key={tile.label} className="card" style={{ padding: '14px 16px' }}>
              <div className="muted" style={{ fontSize: 12.5, fontWeight: 600 }}>{tile.label}</div>
              <div style={{ fontSize: 22, fontWeight: 800, marginTop: 4 }}>{tile.value}</div>
            </div>
          ))}
        </div>

        <section className="card" style={{ overflow: 'hidden' }}>
          <div style={{ overflow: 'auto' }}>
            {loading ? (
              <div className="muted" style={{ padding: 30, textAlign: 'center' }}>Loading users…</div>
            ) : (
              <table className="tbl">
                <thead>
                  <tr>
                    <SortTh label="Name" sortKey="name" sort={sortable.sort} onSort={sortable.toggle} />
                    <SortTh label="Roles" sortKey="roles" sort={sortable.sort} onSort={sortable.toggle} />
                    <SortTh label="Status" sortKey="status" sort={sortable.sort} onSort={sortable.toggle} />
                    <SortTh label="Added" sortKey="added" sort={sortable.sort} onSort={sortable.toggle} />
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {sortable.rows.map((u) => {
                    const isMe = u.id === me?.id;
                    return (
                      <tr key={u.id}>
                        <td>
                          <strong>{u.name}</strong>{isMe && <span className="pill b" style={{ marginLeft: 6 }}>You</span>}
                          <div className="muted" style={{ fontSize: 12.5 }}>{u.email}</div>
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                            {u.roles.map((r) => <StatusPill key={r} tone={r === 'OWNER' ? 'blue' : 'grey'}>{roleInfo[r].label}</StatusPill>)}
                          </div>
                        </td>
                        <td><StatusPill tone={u.active ? 'green' : 'grey'}>{u.active ? 'Active' : 'Inactive'}</StatusPill></td>
                        <td className="muted">{formatDate(u.createdAt)}</td>
                        <td style={{ whiteSpace: 'nowrap' }}>
                          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                            <button type="button" className="btn" style={{ minHeight: 36 }} onClick={() => setEditor({ mode: 'edit', user: u })}>Edit</button>
                            <button
                              type="button"
                              className="btn"
                              style={{ minHeight: 36 }}
                              disabled={isMe}
                              title={isMe ? 'You cannot deactivate your own account' : undefined}
                              onClick={() => void toggleActive(u)}
                            >
                              {u.active ? 'Deactivate' : 'Activate'}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {filtered.length === 0 && (
                    <tr><td colSpan={5} style={{ textAlign: 'center', padding: 40 }} className="muted">{users.length === 0 ? 'No users yet' : 'No users match'}</td></tr>
                  )}
                </tbody>
              </table>
            )}
          </div>
        </section>

        <section className="card" style={{ padding: 18 }}>
          <div style={{ fontWeight: 700, marginBottom: 10 }}>What each role can use</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
            {allRoles.map((r) => (
              <div key={r} style={{ padding: 12, border: '1px solid var(--border-light)', borderRadius: 10 }}>
                <StatusPill tone={r === 'OWNER' ? 'blue' : 'grey'}>{roleInfo[r].label}</StatusPill>
                <div className="muted" style={{ fontSize: 13, marginTop: 8, lineHeight: 1.45 }}>{roleInfo[r].help}</div>
              </div>
            ))}
          </div>
          <div className="muted" style={{ fontSize: 12.5, marginTop: 10 }}>A user can have more than one role. Email cannot be changed later: deactivate the account and add a new one.</div>
        </section>
      </div>

      {editor && (
        <UserEditor
          mode={editor.mode}
          user={editor.mode === 'edit' ? editor.user : undefined}
          isSelf={editor.mode === 'edit' && editor.user.id === me?.id}
          onClose={() => setEditor(null)}
          onSaved={async (message) => {
            setEditor(null);
            setNotice(message);
            await load();
          }}
        />
      )}
    </>
  );
}

function UserEditor({
  mode,
  user,
  isSelf,
  onClose,
  onSaved,
}: {
  mode: 'create' | 'edit';
  user?: UserRow;
  isSelf: boolean;
  onClose: () => void;
  onSaved: (message: string) => void | Promise<void>;
}) {
  const [form, setForm] = useState<UserForm>(() => formFrom(user));
  const [touched, setTouched] = useState<Partial<Record<keyof UserForm, boolean>>>({});
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const errors = formErrors(form, mode);
  const shown = (key: keyof UserForm) => (submitted || touched[key] ? errors[key] : undefined);

  function set<K extends keyof UserForm>(key: K, value: UserForm[K]) {
    setSaveError(null);
    setForm((f) => ({ ...f, [key]: value }));
  }

  function toggleRole(role: Role) {
    if (isSelf && role === 'OWNER' && form.roles.includes('OWNER')) return; // keep your own Owner role
    set('roles', form.roles.includes(role) ? form.roles.filter((r) => r !== role) : [...form.roles, role]);
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
      if (mode === 'create') {
        await api.post('/users', { name: form.name.trim(), email: form.email.trim(), password: form.password, roles: form.roles });
        await onSaved(`${form.name.trim()} was added.`);
      } else if (user) {
        await api.patch(`/users/${user.id}`, {
          name: form.name.trim(),
          roles: form.roles,
          active: isSelf ? undefined : form.active,
          password: form.password || undefined,
        });
        await onSaved(`${form.name.trim()} was updated.`);
      }
    } catch (err) {
      setSaveError(err instanceof ApiError ? err.message : 'Could not save the user');
    } finally {
      setSaving(false);
    }
  }

  const blur = (key: keyof UserForm) => () => setTouched((t) => ({ ...t, [key]: true }));

  return (
    <Modal
      title={mode === 'create' ? 'Add user' : `Edit ${user?.name ?? 'user'}`}
      subtitle={mode === 'create' ? 'They sign in with this email and password.' : user?.email}
      onClose={onClose}
      width={600}
      footer={
        <>
          <button type="button" className="btn" style={{ minHeight: 44 }} onClick={onClose}>Cancel</button>
          <button type="button" className="btn p" style={{ minHeight: 44 }} disabled={saving} onClick={() => void save()}>
            {saving ? 'Saving…' : mode === 'create' ? 'Add user' : 'Save changes'}
          </button>
        </>
      }
    >
      {saveError && <Notice kind="error">{saveError}</Notice>}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 14 }}>
        <Field label="Full name" required error={shown('name')} style={{ gridColumn: '1 / -1' }}>
          {({ id, invalid }) => (
            <input id={id} className="in" value={form.name} maxLength={80} aria-invalid={invalid} onChange={(e) => set('name', e.target.value)} onBlur={blur('name')} />
          )}
        </Field>
        <Field label="Email" required={mode === 'create'} error={shown('email')} hint={mode === 'edit' ? 'Email cannot be changed' : undefined} style={{ gridColumn: '1 / -1' }}>
          {({ id, invalid }) => (
            <input id={id} type="email" className="in" value={form.email} disabled={mode === 'edit'} aria-invalid={invalid} onChange={(e) => set('email', e.target.value)} onBlur={blur('email')} />
          )}
        </Field>
        <Field label={mode === 'create' ? 'Password' : 'New password'} required={mode === 'create'} error={shown('password')} hint={mode === 'create' ? 'At least 8 characters' : 'Leave empty to keep the current password'}>
          {({ id, invalid }) => (
            <input id={id} type="password" autoComplete="new-password" className="in" value={form.password} aria-invalid={invalid} onChange={(e) => set('password', e.target.value)} onBlur={blur('password')} />
          )}
        </Field>
        <Field label="Confirm password" required={mode === 'create'} error={shown('confirm')}>
          {({ id, invalid }) => (
            <input id={id} type="password" autoComplete="new-password" className="in" value={form.confirm} aria-invalid={invalid} onChange={(e) => set('confirm', e.target.value)} onBlur={blur('confirm')} />
          )}
        </Field>
      </div>

      <div>
        <div className="lbl" style={{ marginBottom: 8 }}>Roles <span style={{ color: '#B42318' }}>*</span></div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
          {allRoles.map((r) => {
            const on = form.roles.includes(r);
            const locked = isSelf && r === 'OWNER' && on;
            return (
              <label
                key={r}
                style={{
                  display: 'flex', gap: 10, alignItems: 'flex-start', padding: 12, borderRadius: 10, cursor: locked ? 'not-allowed' : 'pointer',
                  border: on ? '2px solid #1F6B45' : '1px solid #C9D2C8', background: on ? '#F1F8F3' : '#fff',
                }}
              >
                <input type="checkbox" checked={on} disabled={locked} onChange={() => toggleRole(r)} style={{ width: 18, height: 18, marginTop: 2 }} />
                <span>
                  <span style={{ fontWeight: 700, fontSize: 14 }}>{roleInfo[r].label}{locked ? ' (your account)' : ''}</span>
                  <span className="muted" style={{ display: 'block', fontSize: 12.5, marginTop: 2 }}>{roleInfo[r].help}</span>
                </span>
              </label>
            );
          })}
        </div>
        {shown('roles') && <div role="alert" className="field-error">{shown('roles')}</div>}
      </div>

      {mode === 'edit' && (
        <Switch
          checked={form.active}
          disabled={isSelf}
          onChange={(v) => set('active', v)}
          label="Active"
          hint={isSelf ? 'You cannot deactivate your own account.' : 'An inactive user cannot sign in.'}
        />
      )}
    </Modal>
  );
}
