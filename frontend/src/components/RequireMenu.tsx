import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useMenuAccess } from '../lib/menu-access-context.js';

// Guards the app's pages by the pages the owner has given this user's roles. A user who types an
// address they may not open is sent to the first page they do have, so the sidebar and the address
// bar agree.
export function RequireMenu() {
  const { pathname } = useLocation();
  const { routes } = useMenuAccess();

  if (routes === null) return null; // still loading
  if (routes.includes(pathname)) return <Outlet />;

  const home = routes[0];
  if (home && home !== pathname) return <Navigate to={home} replace />;

  return (
    <div className="body">
      <section className="card" style={{ padding: 24, maxWidth: 520 }}>
        <h2 style={{ margin: 0, fontSize: 18 }}>No pages for your role yet</h2>
        <p className="muted" style={{ fontSize: 14, lineHeight: 1.5, marginBottom: 0 }}>
          Your account does not have access to any page in this app. Ask the owner to check your role in Settings &gt; Menu Access.
        </p>
      </section>
    </div>
  );
}
