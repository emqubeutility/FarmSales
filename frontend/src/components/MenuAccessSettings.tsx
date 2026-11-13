import { Fragment, useEffect, useState } from 'react';
import { GRANTABLE_ROLES, MENU_PAGES, type GrantableRole, type RoleMenuMatrix } from '@farm-sales/shared';
import { api, ApiError } from '../lib/api.js';
import { Notice, SectionCard } from './ui.js';
import { SkeletonBlock } from './Skeleton.js';

// Settings > Menu Access: the owner ticks the sidebar pages each role may open.
// Owner always has every page, so the owner column is fixed on.

const roleLabel: Record<GrantableRole, string> = { CASHIER: 'Cashier', WAREHOUSE: 'Warehouse', DELIVERY: 'Delivery' };
const groups = [...new Set(MENU_PAGES.map((page) => page.group))];

type Pages = Record<GrantableRole, string[]>;

function sameList(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((item, i) => item === b[i]);
}

function errorText(err: unknown): string {
  return err instanceof ApiError ? err.message : 'Could not save the menu access';
}

export function MenuAccessSettings() {
  const [saved, setSaved] = useState<Pages | null>(null);
  const [draft, setDraft] = useState<Pages | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ kind: 'error' | 'success'; text: string } | null>(null);

  useEffect(() => {
    api.get<RoleMenuMatrix>('/menu-access')
      .then((matrix) => {
        const pages: Pages = {
          CASHIER: [...(matrix.CASHIER ?? [])],
          WAREHOUSE: [...(matrix.WAREHOUSE ?? [])],
          DELIVERY: [...(matrix.DELIVERY ?? [])],
        };
        setSaved(pages);
        setDraft(pages);
      })
      .catch((err) => setMessage({ kind: 'error', text: errorText(err) }));
  }, []);

  if (!draft || !saved) {
    return message ? <Notice kind="error">{message.text}</Notice> : <SkeletonBlock height={320} />;
  }

  const changed = GRANTABLE_ROLES.filter((role) => !sameList(saved[role], draft[role]));

  function setPage(role: GrantableRole, route: string, on: boolean) {
    setMessage(null);
    setDraft((current) => {
      if (!current) return current;
      const list = current[role].filter((r) => r !== route);
      return { ...current, [role]: on ? [...list, route] : list };
    });
  }

  async function save() {
    if (!draft || changed.length === 0) return;
    setSaving(true);
    setMessage(null);
    try {
      for (const role of changed) {
        await api.put(`/menu-access/${role}`, { routes: draft[role] });
      }
      setSaved(draft);
      setMessage({ kind: 'success', text: 'Saved. Each role sees these pages the next time they open the app.' });
    } catch (err) {
      setMessage({ kind: 'error', text: errorText(err) });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="page-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 22 }}>Menu Access</h2>
          <div className="muted" style={{ fontSize: 13.5, marginTop: 2 }}>Choose which sidebar pages each role can open</div>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button type="button" className="btn" style={{ minHeight: 44, padding: '0 18px' }} disabled={changed.length === 0 || saving} onClick={() => { setDraft(saved); setMessage(null); }}>
            Discard
          </button>
          <button type="button" className="btn p" style={{ minHeight: 44, padding: '0 24px' }} disabled={changed.length === 0 || saving} onClick={() => void save()}>
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </div>

      {message && <Notice kind={message.kind}>{message.text}</Notice>}

      <SectionCard title="Sidebar pages by role" description="Owner-only pages (Reports, User Management, Settings) are fixed to the owner.">
        <div style={{ overflow: 'visible', margin: '-20px -20px 0' }}>
          <table className="tbl">
            <thead>
              <tr style={{ background: '#E8F3EC' }}>
                <th style={{ minWidth: 200 }}>Page</th>
                <th style={{ textAlign: 'center' }}>Owner</th>
                {GRANTABLE_ROLES.map((role) => <th key={role} style={{ textAlign: 'center' }}>{roleLabel[role]}</th>)}
              </tr>
            </thead>
            <tbody>
              {groups.map((group) => (
                <Fragment key={group}>
                  <tr>
                    <td colSpan={2 + GRANTABLE_ROLES.length} style={{ background: '#F6F8F5', fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', color: '#4B5A51' }}>
                      {group}
                    </td>
                  </tr>
                  {MENU_PAGES.filter((page) => page.group === group).map((page) => (
                    <tr key={page.route}>
                      <td>
                        <strong>{page.label}</strong>
                        <div className="muted" style={{ fontSize: 12.5 }}>{page.route}</div>
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <CheckCell label={`Owner can open ${page.label}`} checked disabled />
                      </td>
                      {page.ownerOnly ? (
                        <td colSpan={GRANTABLE_ROLES.length} className="muted" style={{ textAlign: 'center', fontSize: 13 }}>Owner only</td>
                      ) : (
                        GRANTABLE_ROLES.map((role) => (
                          <td key={role} style={{ textAlign: 'center' }}>
                            <CheckCell
                              label={`${roleLabel[role]} can open ${page.label}`}
                              checked={draft[role].includes(page.route)}
                              onChange={(on) => setPage(role, page.route, on)}
                            />
                          </td>
                        ))
                      )}
                    </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </div>
  );
}

// A checkbox in a 44px touch target, as the tablet-first UI needs.
function CheckCell({ label, checked, disabled, onChange }: { label: string; checked: boolean; disabled?: boolean; onChange?: (on: boolean) => void }) {
  return (
    <label style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: 44, minHeight: 44, cursor: disabled ? 'default' : 'pointer' }}>
      <input
        type="checkbox"
        aria-label={label}
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange?.(e.target.checked)}
        style={{ width: 20, height: 20, margin: 0 }}
      />
    </label>
  );
}
