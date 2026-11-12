import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../lib/auth-context.js';
import { api } from '../lib/api.js';
import { Icon } from './Icon.js';
import { useMenuAccess } from '../lib/menu-access-context.js';

type NavItem = { to: string; label: string; icon: string; planned?: boolean };

const navGroups: { label: string; items: NavItem[] }[] = [
  { label: 'Overview', items: [{ to: '/dashboard', label: 'Dashboard', icon: 'dashboard' }] },
  {
    label: 'Sales',
    items: [
      { to: '/pos', label: 'POS', icon: 'pos' },
      { to: '/sales', label: 'Sales History', icon: 'history' },
      { to: '/returns', label: 'Returns & Refunds', icon: 'returns' },
    ],
  },
  { label: 'Fulfilment', items: [{ to: '/orders', label: 'Fulfilments', icon: 'fulfilment' }] },
  {
    label: 'Inventory',
    items: [
      { to: '/items', label: 'Items & Products', icon: 'items' },
      { to: '/inventory', label: 'Stock Overview', icon: 'stock' },
      { to: '/batches', label: 'Batches & Expiry', icon: 'batches' },
    ],
  },
  {
    label: 'Procurement',
    items: [
      { to: '/receive-stock', label: 'Receive Stock', icon: 'receive' },
      { to: '/suppliers', label: 'Suppliers', icon: 'suppliers' },
    ],
  },
  {
    label: 'Administration',
    items: [
      { to: '/customers', label: 'Customers', icon: 'customers' },
      { to: '/reports', label: 'Reports', icon: 'reports', planned: true },
      { to: '/users', label: 'User Management', icon: 'users' },
      { to: '/settings', label: 'Settings', icon: 'settings' },
    ],
  },
];

const COLLAPSED_KEY = 'farmsales.sidebarCollapsed';

// The signed-in user at the bottom of the sidebar. Click it to open a small menu with Log out.
function UserMenu({ name, roles, collapsed, onLogout }: { name: string; roles: string[]; collapsed: boolean; onLogout: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const initials = name.split(' ').filter(Boolean).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
  return (
    <div className="side-user" ref={ref}>
      {open && (
        <div className="side-user-menu" role="menu">
          <div className="side-user-menu-head">
            <div style={{ fontWeight: 700 }}>{name}</div>
            <div className="side-user-role">{roles.join(', ')}</div>
          </div>
          <button type="button" role="menuitem" className="side-user-menu-item" onClick={onLogout}>Log out</button>
        </div>
      )}
      <button type="button" className="side-user-button" aria-haspopup="menu" aria-expanded={open} title={collapsed ? name : undefined} onClick={() => setOpen((v) => !v)}>
        <span className="side-user-avatar" aria-hidden="true">{initials}</span>
        <span className="side-user-text">
          <span className="side-user-name">{name}</span>
          <span className="side-user-role">{roles.join(', ')}</span>
        </span>
        <span className="side-user-caret" aria-hidden="true">{open ? '▴' : '▾'}</span>
      </button>
    </div>
  );
}

export function AppShell() {
  const { user, logout } = useAuth();
  const [brand, setBrand] = useState<{ name: string; logoUrl: string | null } | null>(null);
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try {
      return window.localStorage.getItem(COLLAPSED_KEY) === '1';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    api.get<{ name: string; logoUrl: string | null }>('/business-profile').then(setBrand).catch(() => {
      // Keep the navigation usable if the business profile cannot be read.
    });
  }, []);

  // Only the pages the owner has given this user's roles, and only the groups that still have one.
  const { routes } = useMenuAccess();
  const allowed = routes ?? [];
  const visibleGroups = navGroups
    .map((group) => ({ ...group, items: group.items.filter((item) => allowed.includes(item.to)) }))
    .filter((group) => group.items.length > 0);

  function toggleCollapsed() {
    setCollapsed((c) => {
      const next = !c;
      try {
        window.localStorage.setItem(COLLAPSED_KEY, next ? '1' : '0');
      } catch {
        // Storage can be blocked; the choice then lasts for this visit only.
      }
      return next;
    });
  }

  return (
    <div className={`app${collapsed ? ' side-collapsed' : ''}`}>
      <aside className="side" aria-label="Sidebar">
        <div className="side-head">
          <button type="button" className="side-menu-button" aria-label={collapsed ? 'Open menu' : 'Collapse menu'} aria-expanded={!collapsed} onClick={toggleCollapsed}>
            <Icon name="menu" size={22} />
          </button>
          <div className="side-brand" title={brand?.name ?? 'KHIRAK'}>
            {brand?.logoUrl ? (
              <img src={brand.logoUrl} alt="" className="side-logo" />
            ) : (
              <span className="side-leaf" aria-hidden="true"><Icon name="leaf" size={20} /></span>
            )}
            <span className="side-brand-name">{brand?.name ?? 'KHIRAK'}</span>
          </div>
        </div>

        <nav className="side-navigation" aria-label="Main navigation">
          {visibleGroups.map((group) => (
            <div className="nav-group" key={group.label}>
              <div className="grp">{group.label}</div>
              {group.items.map((item) => (
                <NavLink key={item.to} to={item.to} className={({ isActive }) => `nav${isActive ? ' on' : ''}`} title={item.label}>
                  <Icon name={item.icon} />
                  <span className="nav-label">{item.label}</span>
                  {item.planned && <span className="nav-planned">Soon</span>}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>

        {user && <UserMenu name={user.name} roles={user.roles} collapsed={collapsed} onLogout={() => logout()} />}
      </aside>
      <div className="main">
        <Outlet />
      </div>
    </div>
  );
}
