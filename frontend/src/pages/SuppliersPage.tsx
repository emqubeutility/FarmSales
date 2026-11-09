import { useEffect, useMemo, useState } from 'react';
import { api, ApiError } from '../lib/api.js';
import { SortTh, useTableSort } from '../lib/table-sort.js';

interface Supplier {
  id: string;
  name: string;
  gstin: string | null;
}

export function SuppliersPage() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [search, setSearch] = useState('');
  // Matches the name or GSTIN, ignoring case and surrounding spaces.
  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return suppliers;
    return suppliers.filter((s) => [s.name, s.gstin ?? ''].some((value) => value.toLowerCase().includes(term)));
  }, [suppliers, search]);
  const sortable = useTableSort(visible, {
    supplier: (s) => s.name,
    gstin: (s) => s.gstin,
  });
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [gstin, setGstin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function reload() {
    return api.get<Supplier[]>('/suppliers').then(setSuppliers);
  }

  useEffect(() => {
    reload();
  }, []);

  function resetForm() {
    setName('');
    setGstin('');
    setError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      await api.post<Supplier>('/suppliers', { name: name.trim(), gstin: gstin.trim() || undefined });
      resetForm();
      setShowForm(false);
      await reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save supplier');
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="top">
        <h1>Suppliers</h1>
        <div style={{ flex: 1 }} />
        <label className="ft-search is-compact">
          <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="7" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            className="in"
            type="search"
            placeholder="Search supplier or GSTIN"
            aria-label="Search suppliers"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <button
          className="btn p"
          onClick={() => {
            if (showForm) {
              resetForm();
              setShowForm(false);
            } else {
              setShowForm(true);
            }
          }}
        >
          {showForm ? 'Close' : 'Add supplier'}
        </button>
      </div>
      <div className="body">
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 16 }}>
          {showForm && (
            <form className="card" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }} onSubmit={handleSubmit}>
              {error && <div className="error-banner">{error}</div>}
              <div>
                <label className="lbl" htmlFor="supplierName">Supplier name</label>
                <input
                  id="supplierName"
                  className="in"
                  placeholder="e.g. Supplier A, Nashik"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>
              <div>
                <label className="lbl" htmlFor="supplierGstin">GSTIN (optional)</label>
                <input
                  id="supplierGstin"
                  className="in"
                  placeholder="As printed on the supplier's bill"
                  value={gstin}
                  onChange={(e) => setGstin(e.target.value)}
                />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <button type="submit" className="btn p" disabled={saving || !name.trim()}>
                  {saving ? 'Saving…' : 'Save supplier'}
                </button>
              </div>
            </form>
          )}

          <div className="card" style={{ overflow: 'hidden' }}>
            <table className="tbl">
              <thead>
                <tr>
                  <SortTh label="Supplier" sortKey="supplier" sort={sortable.sort} onSort={sortable.toggle} />
                  <SortTh label="GSTIN" sortKey="gstin" sort={sortable.sort} onSort={sortable.toggle} />
                </tr>
              </thead>
              <tbody>
                {sortable.rows.map((s) => (
                  <tr key={s.id}>
                    <td><b>{s.name}</b></td>
                    <td>{s.gstin ?? '–'}</td>
                  </tr>
                ))}
                {suppliers.length === 0 && (
                  <tr><td colSpan={2} className="muted" style={{ padding: 20, textAlign: 'center' }}>No suppliers yet. Add one to start receiving stock.</td></tr>
                )}
                {suppliers.length > 0 && visible.length === 0 && (
                  <tr>
                    <td colSpan={2} style={{ textAlign: 'center', padding: 40 }}>
                      <div style={{ fontWeight: 600 }}>No suppliers match “{search.trim()}”</div>
                      <button type="button" className="btn" style={{ marginTop: 14 }} onClick={() => setSearch('')}>
                        Clear search
                      </button>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
}
