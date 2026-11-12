
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
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const from =
    (location.state as { from?: string } | null)?.from ?? '/dashboard';

  if (user) {
    return <Navigate to={from} replace />;
  }

  async function doLogin(loginEmail: string, loginPassword: string) {
    setError(null);
    setSubmitting(true);

    try {
      await login(loginEmail, loginPassword);
      navigate(from, { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Login failed');
    } finally {
      setSubmitting(false);
    }
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    doLogin(email.trim(), password);
  }

  return (
    <main className="login-page">
      <section className="login-shell">
        {/* Brand panel */}
        <aside className="login-brand-panel">
          <div className="login-brand">
            <div className="login-brand-mark" aria-hidden="true">
              <svg
                width="30"
                height="30"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M20 4c-8 0-14 3-14 10a6 6 0 0 0 6 6c7 0 8-8 8-16Z" />
                <path d="M4 20c3-5 7-8 12-11" />
              </svg>
            </div>

            <span className="login-brand-name">KHIRAK</span>
          </div>

          <div className="login-brand-content">
            <span className="login-eyebrow">RETAIL MANAGEMENT</span>
            <h1>Manage your store, simply.</h1>
            <p>
              Sales, inventory, fulfilments and your team — all in one place.
            </p>
          </div>

          <div className="login-brand-footer">
            <span className="login-brand-dot" />
            FarmSales Management System
          </div>
        </aside>

        {/* Login form */}
        <section className="login-form-panel">
          <div className="login-form-content">
            <div className="login-mobile-brand">
              <div className="login-brand-mark" aria-hidden="true">
                <svg
                  width="26"
                  height="26"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M20 4c-8 0-14 3-14 10a6 6 0 0 0 6 6c7 0 8-8 8-16Z" />
                  <path d="M4 20c3-5 7-8 12-11" />
                </svg>
              </div>
              <span>KHIRAK</span>
            </div>

            <div className="login-heading">
              <h2>Welcome back</h2>
              <p>Sign in to continue to your account.</p>
            </div>

            {error && (
              <div className="login-error" role="alert">
                <span className="login-error-icon">!</span>
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="login-form">
              <div className="login-field">
                <label htmlFor="email">Email address</label>
                <input
                  id="email"
                  type="email"
                  autoComplete="username"
                  placeholder="you@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  disabled={submitting}
                  autoFocus
                />
              </div>

              <div className="login-field">
                <div className="login-password-label">
                  <label htmlFor="password">Password</label>
                </div>

                <div className="login-password-wrap">
                  <input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    placeholder="Enter your password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    disabled={submitting}
                  />

                  <button
                    type="button"
                    className="login-password-toggle"
                    onClick={() => setShowPassword((prev) => !prev)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    disabled={submitting}
                  >
                    {showPassword ? 'Hide' : 'Show'}
                  </button>
                </div>
              </div>

              <button
                className="login-submit"
                type="submit"
                disabled={submitting}
              >
                {submitting ? (
                  <>
                    <span className="login-spinner" />
                    Signing in...
                  </>
                ) : (
                  <>
                    Sign in
                    <span aria-hidden="true">→</span>
                  </>
                )}
              </button>
            </form>

            <div className="login-secure-note">
              <svg
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <rect x="3" y="11" width="18" height="10" rx="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
              Secure access to your business
            </div>

           
          </div>
        </section>
      </section>
    </main>
  );
}

const quickLogins = [
  { label: 'Owner', email: 'owner@farmsales.test', password: 'OwnerPass123!' },
  { label: 'Cashier', email: 'cashier@farmsales.test', password: 'CashierPass123!' },
  {
    label: 'Warehouse',
    email: 'warehouse@farmsales.test',
    password: 'WarehousePass123!',
  },
  { label: 'Delivery', email: 'delivery@farmsales.test', password: 'DeliveryPass123!' },
  {
    label: 'Cashier + Warehouse',
    email: 'cashier.warehouse@farmsales.test',
    password: 'ComboPass123!',
  },
];
