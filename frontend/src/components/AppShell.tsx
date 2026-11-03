import { useEffect, useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../lib/auth-context.js';
import { api } from '../lib/api.js';

type NavItem = { to: string; label: string; icon: string; planned?: boolean };

const navGroups: { label: string; items: NavItem[] }[] = [
  {
    label: 'Overview',
    items: [{ to: '/dashboard', label: 'Dashboard', icon: '▦' }],
  },
  {
    label: 'Sales',
    items: [
      { to: '/pos', label: 'POS', icon: '▣' },
      { to: '/sales', label: 'Sales History', icon: '▤' },
      { to: '/returns', label: 'Returns & Refunds', icon: '↶' },
    ],
  },
  {
    label: 'Fulfilment',
    items: [{ to: '/orders', label: 'Fulfilments', icon: '▣' }],
  },
  {
    label: 'Inventory',
    items: [
      { to: '/items', label: 'Items & Products', icon: '□' },
      { to: '/inventory', label: 'Stock Overview', icon: '▥' },
      { to: '/batches', label: 'Batches & Expiry', icon: '▧' },
    ],
  },
  {
    label: 'Procurement',
    items: [
      { to: '/receive-stock', label: 'Receive Stock', icon: '↓' },
      { to: '/suppliers', label: 'Suppliers', icon: '♧' },
    ],
  },
  {
    label: 'Administration',
    items: [
      { to: '/customers', label: 'Customers', icon: '♙', planned: true },
      { to: '/reports', label: 'Reports', icon: '▥', planned: true },
      { to: '/users', label: 'User Management', icon: '♧', planned: true },
      { to: '/settings', label: 'Settings', icon: '⚙' },
    ],
  },
];

export function AppShell() {
  const { user, logout } = useAuth();
  const [brand, setBrand] = useState<{ name: string; logoUrl: string | null; phone: string | null; email: string | null } | null>(null);

  useEffect(() => {
    api.get<{ name: string; logoUrl: string | null; phone: string | null; email: string | null }>('/business-profile').then(setBrand).catch(() => {
      // Keep the navigation usable if business profile settings are not available.
    });
  }, []);

  return (
    <div className="app">
      <aside className="side">
        <div className="brand" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {brand?.logoUrl && <img src={brand.logoUrl} alt="" style={{ width: 26, height: 26, borderRadius: 7, objectFit: 'cover' }} />}
          <span>{brand?.name ?? 'KHIRAK'}</span>
        </div>
        {(brand?.phone || brand?.email) && (
          <div className="side-contact">
            {brand.phone && <div>{brand.phone}</div>}
            {brand.email && <div>{brand.email}</div>}
          </div>
        )}

        <nav className="side-navigation" aria-label="Main navigation">
          {navGroups.map((group) => (
            <div className="nav-group" key={group.label}>
              <div className="grp">{group.label}</div>
              {group.items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) => `nav${isActive ? ' on' : ''}`}
                  title={item.label}
                >
                  {/* <span className="nav-icon" aria-hidden="true">{item.icon}</span> */}
                  <span className="nav-label">{item.label}</span>
                  {item.planned && <span className="nav-planned">Soon</span>}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>

        <div style={{ flex: 1 }} />
        {user && (
          <div className="side-user">
            <div className="side-user-name">{user.name}</div>
            <div className="side-user-role">{user.roles.join(', ')}</div>
            <button className="btn side-logout" onClick={() => logout()}>Log out</button>
          </div>
        )}
      </aside>
      <div className="main">
        <Outlet />
      </div>
    </div>
  );
}
