import { useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth-context.js';
import { ApiError } from '../lib/api.js';

export function LoginPage() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (user) {
    const from = (location.state as { from?: string } | null)?.from ?? '/dashboard';
    return <Navigate to={from} replace />;
  }

  async function doLogin(loginEmail: string, loginPassword: string) {
    setError(null);
    setSubmitting(true);
    try {
      await login(loginEmail, loginPassword);
      navigate('/dashboard', { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Login failed');
    } finally {
      setSubmitting(false);
    }
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    doLogin(email, password);
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)' }}>
      <form onSubmit={handleSubmit} className="card" style={{ width: 360, padding: 28, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ fontSize: 20, fontWeight: 700, color: '#12301F' }}>[YOUR BRAND]</div>
        <div className="muted" style={{ fontSize: 14, marginBottom: 6 }}>Sales and inventory sign in</div>
        {error && <div className="error-banner">{error}</div>}
        <div>
          <label className="lbl" htmlFor="email">Email</label>
          <input
            id="email"
            className="in"
            type="email"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
        <div>
          <label className="lbl" htmlFor="password">Password</label>
          <input
            id="password"
            className="in"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>
        <button className="btn p" type="submit" disabled={submitting} style={{ minHeight: 48, marginTop: 6 }}>
          {submitting ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
      {import.meta.env.DEV && (
        <div className="card" style={{ width: 360, padding: 20, marginTop: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div className="muted" style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase' }}>
            Dev only · quick login
          </div>
          {quickLogins.map((q) => (
            <button
              key={q.email}
              type="button"
              className="btn"
              disabled={submitting}
              style={{ justifyContent: 'flex-start' }}
              onClick={() => doLogin(q.email, q.password)}
            >
              {q.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// Seeded by the scratchpad test-user script, not by the app itself — these accounts only exist if
// someone ran that script against this database. Gated to dev builds so it never ships.
const quickLogins = [
  { label: 'Owner', email: 'owner@farmsales.test', password: 'OwnerPass123!' },
  { label: 'Cashier', email: 'cashier@farmsales.test', password: 'CashierPass123!' },
  { label: 'Warehouse', email: 'warehouse@farmsales.test', password: 'WarehousePass123!' },
  { label: 'Delivery', email: 'delivery@farmsales.test', password: 'DeliveryPass123!' },
  { label: 'Cashier + Warehouse', email: 'cashier.warehouse@farmsales.test', password: 'ComboPass123!' },
];
