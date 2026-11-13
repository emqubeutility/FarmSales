import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { createUserSchema, updateUserSchema, type Role } from '@farm-sales/shared';
import { api, ApiError } from '../lib/api.js';
import { formatDate } from '../lib/format.js';
import { useAuth } from '../lib/auth-context.js';
import { SortTh, useTableSort } from '../lib/table-sort.js';
import { Field, Modal, Notice, Switch } from '../components/ui.js';
import { Icon } from '../components/Icon.js';
import { LoadingRow } from '../components/Skeleton.js';

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
  DELIVERY: { label: 'Delivery', help: 'Delivery routes, record deliveries and cash collected.' },
};
const allRoles: Role[] = ['OWNER', 'CASHIER', 'WAREHOUSE', 'DELIVERY'];

type StatusFilter = 'all' | 'active' | 'inactive';

const roleIcon: Record<Role, string> = { OWNER: 'crown', CASHIER: 'store', WAREHOUSE: 'items', DELIVERY: 'truck' };
// One colour per role, so the table is easy to scan.
const rolePillColours: Record<Role, { background: string; color: string }> = {
  OWNER: { background: '#E4EEF9', color: '#1E4E8C' },
  CASHIER: { background: '#E3F5E9', color: '#14572E' },
  WAREHOUSE: { background: '#EEE8FA', color: '#5B3FB0' },
  DELIVERY: { background: '#FCF1D8', color: '#8A5A00' },
};

function RolePill({ role }: { role: Role }) {
  return (
    <span style={{ ...rolePillColours[role], padding: '4px 12px', borderRadius: 999, fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap' }}>
      {roleInfo[role].label}
    </span>
  );
}

function statusStyle(active: boolean): CSSProperties {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 8,
    padding: '4px 12px',
    borderRadius: 999,
    fontSize: 13,
    fontWeight: 600,
    whiteSpace: 'nowrap',
    ...(active ? { background: '#E3F5E9', color: '#14572E' } : { background: '#EEF0EE', color: '#4B5A51' }),
  };
}

const iconButton: CSSProperties = { width: 38, height: 38, minHeight: 38, padding: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', borderRadius: 8 };
const menuPanel: CSSProperties = { position: 'fixed', zIndex: 50, minWidth: 170, background: '#fff', border: '1px solid #DDE5DE', borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.12)', padding: 6, textAlign: 'left' };
const menuItem: CSSProperties = { display: 'block', width: '100%', minHeight: 40, padding: '0 12px', border: 0, borderRadius: 8, background: 'transparent', cursor: 'pointer', textAlign: 'left', fontSize: 14, fontWeight: 600, color: '#17261E' };

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
  const [filter, setFilter] = useState<StatusFilter>('all');
  // The open row menu, placed at its button's position on screen.
  const [menu, setMenu] = useState<{ id: string; top: number; right: number } | null>(null);

  // The row menu closes on a click outside it, on Escape, or when the page or table scrolls.
  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    function onDown(e: MouseEvent) {
      if (!(e.target as HTMLElement).closest('[data-user-menu]')) close();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') close();
    }
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    document.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [menu]);

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

  const counts = { all: users.length, active: users.filter((u) => u.active).length, inactive: users.filter((u) => !u.active).length };
  const statusOptions: { id: StatusFilter; label: string }[] = [
    { id: 'all', label: `All Users (${counts.all})` },
    { id: 'active', label: `Active (${counts.active})` },
    { id: 'inactive', label: `Inactive (${counts.inactive})` },
  ];

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return users.filter((u) => {
      if (filter === 'active' && !u.active) return false;
      if (filter === 'inactive' && u.active) return false;
      return !term || u.name.toLowerCase().includes(term) || u.email.toLowerCase().includes(term);
    });
  }, [users, search, filter]);

  const sortable = useTableSort(filtered, {
    name: (u: UserRow) => u.name,
    roles: (u: UserRow) => u.roles.join(', '),
    status: (u: UserRow) => (u.active ? 'Active' : 'Inactive'),
    added: (u: UserRow) => new Date(u.createdAt).getTime(),
  });


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
        <div style={{ position: 'relative', width: 280 }}>
          <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#6B7A70', display: 'flex', pointerEvents: 'none' }}>
            <Icon name="search" size={18} />
          </span>
          <input className="in" style={{ width: '100%', paddingLeft: 38 }} placeholder="Search name or email…" aria-label="Search users" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <button type="button" className="btn p" style={{ minHeight: 42, padding: '0 18px', whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: 8 }} onClick={() => setEditor({ mode: 'create' })}>
          <Icon name="plus" size={18} strokeWidth={2.2} />
          Add User
        </button>
      </div>

      <div className="body" style={{ flexDirection: 'column', gap: 16 }}>
        {error && <Notice kind="error">{error}</Notice>}
        {notice && <Notice kind="success">{notice}</Notice>}

        <div role="group" aria-label="Filter by status" style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {statusOptions.map((opt) => {
            const on = filter === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                aria-pressed={on}
                onClick={() => { setFilter(opt.id); setMenu(null); }}
                style={{ minHeight: 40, padding: '0 20px', borderRadius: 999, cursor: 'pointer', fontWeight: 600, fontSize: 14, border: on ? '1px solid #1F6B45' : '1px solid #C9D2C8', background: on ? '#1F6B45' : '#fff', color: on ? '#fff' : '#17261E' }}
              >
                {opt.label}
              </button>
            );
          })}
        </div>

        <section className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
          {loading ? (
            <table className="tbl users-tbl"><tbody><LoadingRow columns={5} /></tbody></table>
          ) : (
            <table className="tbl users-tbl">
              <thead>
                <tr style={{ background: '#E8F3EC' }}>
                  <SortTh label="Name" sortKey="name" sort={sortable.sort} onSort={sortable.toggle} />
                  <SortTh label="Roles" sortKey="roles" sort={sortable.sort} onSort={sortable.toggle} />
                  <SortTh label="Status" sortKey="status" sort={sortable.sort} onSort={sortable.toggle} />
                  <SortTh label="Added On" sortKey="added" sort={sortable.sort} onSort={sortable.toggle} />
                  <th style={{ width: 110 }} aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {sortable.rows.map((u) => {
                  const isMe = u.id === me?.id;
                  const menuOpen = menu?.id === u.id;
                  return (
                    <tr key={u.id}>
                      <td style={{ padding: '14px 18px' }}>
                        <div style={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
                          {u.name}
                          {isMe && <span className="pill b">You</span>}
                        </div>
                        <div className="muted" style={{ fontSize: 13, marginTop: 2 }}>{u.email}</div>
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                          {u.roles.map((r) => <RolePill key={r} role={r} />)}
                        </div>
                      </td>
                      <td>
                        <span style={statusStyle(u.active)}>
                          <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'currentColor' }} aria-hidden="true" />
                          {u.active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="muted" style={{ whiteSpace: 'nowrap' }}>{formatDate(u.createdAt)}</td>
                      <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <div data-user-menu style={{ display: 'inline-flex', gap: 8, position: 'relative' }}>
                          <button type="button" className="btn" aria-label={`Edit ${u.name}`} title="Edit" style={iconButton} onClick={() => setEditor({ mode: 'edit', user: u })}>
                            <Icon name="pencil" size={17} />
                          </button>
                          <button type="button" className="btn" aria-label={`More actions for ${u.name}`} aria-haspopup="menu" aria-expanded={menuOpen} style={iconButton} onClick={(e) => {
                            if (menuOpen) return setMenu(null);
                            const r = e.currentTarget.getBoundingClientRect();
                            setMenu({ id: u.id, top: r.bottom + 6, right: window.innerWidth - r.right });
                          }}>
                            <Icon name="dots" size={18} />
                          </button>
                          {menuOpen && menu && (
                            <div role="menu" style={{ ...menuPanel, top: menu.top, right: menu.right }}>
                              <button
                                type="button"
                                role="menuitem"
                                style={{ ...menuItem, color: isMe ? '#8A948E' : menuItem.color, cursor: isMe ? 'not-allowed' : 'pointer' }}
                                disabled={isMe}
                                title={isMe ? 'You cannot deactivate your own account' : undefined}
                                onClick={() => { setMenu(null); void toggleActive(u); }}
                              >
                                {u.active ? 'Deactivate' : 'Activate'}
                              </button>
                            </div>
                          )}
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

        <section className="card" style={{ padding: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
            <span style={{ color: '#1F6B45', display: 'flex' }}><Icon name="stock" size={22} /></span>
            <div style={{ fontWeight: 700, fontSize: 17 }}>Role overview</div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
            {allRoles.map((r) => (
              <div key={r} style={{ border: '1px solid #DDE5DE', borderRadius: 12, padding: 16, display: 'flex', gap: 14, alignItems: 'flex-start' }}>
                <span style={{ width: 44, height: 44, borderRadius: 10, background: '#E8F3EC', color: '#1F6B45', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
                  <Icon name={roleIcon[r]} size={22} />
                </span>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 700, marginBottom: 4 }}>{roleInfo[r].label}</div>
                  <div className="muted" style={{ fontSize: 13, lineHeight: 1.45 }}>{roleInfo[r].help}</div>
                </div>
              </div>
            ))}
          </div>
          <div className="muted" style={{ fontSize: 12.5, marginTop: 14 }}>A user can have more than one role. Email cannot be changed later: deactivate the account and add a new one.</div>
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
