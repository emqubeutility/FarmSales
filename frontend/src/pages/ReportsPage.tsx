import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '../lib/api.js';
import { Notice } from '../components/ui.js';
import { PowerBiReport, type PowerBiEmbed } from '../components/PowerBiReport.js';

// The Power BI sales report, embedded in the app. The server signs in as a service principal and
// returns a short-lived embed token, so the report is never public and no password is in the browser.

const REFRESH_BEFORE_EXPIRY_MS = 5 * 60_000;
const MIN_REFRESH_MS = 60_000;

export function ReportsPage() {
  const [embed, setEmbed] = useState<PowerBiEmbed | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setEmbed(await api.get<PowerBiEmbed>('/powerbi/embed'));
    } catch (e) {
      setEmbed(null);
      setError(e instanceof ApiError ? e.message : 'The report could not be loaded.');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Embed tokens last about an hour. Fetch a new one shortly before the current one expires.
  useEffect(() => {
    if (!embed) return;
    const wait = new Date(embed.expiresAt).getTime() - Date.now() - REFRESH_BEFORE_EXPIRY_MS;
    const timer = window.setTimeout(() => void load(), Math.max(wait, MIN_REFRESH_MS));
    return () => window.clearTimeout(timer);
  }, [embed, load]);

  return (
    <>
      <div className="top" style={{ gap: 12 }}>
        <div>
          <h1>Reports</h1>
          <div className="muted" style={{ fontSize: 12 }}>Sales overview from Power BI</div>
        </div>
      </div>

      <div className="body" style={{ flexDirection: 'column', gap: 16 }}>
        {error && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <Notice kind="error">{error}</Notice>
            <div>
              <button type="button" className="btn" onClick={() => void load()}>Try again</button>
            </div>
          </div>
        )}

        {!error && (
          <section className="card" style={{ padding: 0, overflow: 'hidden', flex: 1, minHeight: 480 }}>
            {embed ? (
              <PowerBiReport embed={embed} onError={setError} />
            ) : (
              <div className="muted" style={{ padding: 24, fontSize: 13 }}>Loading report…</div>
            )}
          </section>
        )}
      </div>
    </>
  );
}
