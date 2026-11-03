import { useEffect, useState } from 'react';
import { api, ApiError } from '../lib/api.js';
import { formatPaise } from '../lib/format.js';
import { SortTh, useTableSort } from '../lib/table-sort.js';

interface TaxClass {
  id: string;
  name: string;
}

interface Category {
  id: string;
  name: string;
  active: boolean;
}

interface Item {
  id: string;
  code: string;
  name: string;
  size: string | null;
  unit: string;
  mrpPaise: number | null;
  shelfLifeDays: number | null;
  reorderLevel: number | null;
  taxClassId: string | null;
  categoryId: string | null;
  category: Category | null;
  trackBatches: boolean;
  active: boolean;
}

const emptyForm = {
  code: '',
  name: '',
  size: '',
  unit: 'pack',
  categoryId: '',
  mrpPaise: '',
  shelfLifeDays: '',
  reorderLevel: '',
  taxClassId: '',
  trackBatches: true,
};

function toForm(item: Item) {
  return {
    code: item.code,
    name: item.name,
    size: item.size ?? '',
    unit: item.unit,
    categoryId: item.categoryId ?? '',
    mrpPaise: item.mrpPaise !== null ? (item.mrpPaise / 100).toFixed(2) : '',
    shelfLifeDays: item.shelfLifeDays !== null ? String(item.shelfLifeDays) : '',
    reorderLevel: item.reorderLevel !== null ? String(item.reorderLevel) : '',
    taxClassId: item.taxClassId ?? '',
    trackBatches: item.trackBatches,
  };
}

const itemSortValues = {
  item: (i: Item) => i.name,
  category: (i: Item) => i.category?.name,
  mrp: (i: Item) => i.mrpPaise,
  tracking: (i: Item) => (i.trackBatches ? 'Tracked' : 'Not tracked'),
};

export function ItemsPage() {
  const [items, setItems] = useState<Item[]>([]);
  const sortableItems = useTableSort(items, itemSortValues);
  const [taxClasses, setTaxClasses] = useState<TaxClass[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingItem, setEditingItem] = useState<Item | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function reload() {
    const query = new URLSearchParams();
    if (search) query.set('search', search);
    const [itemList, taxClassList, categoryList] = await Promise.all([
      api.get<Item[]>(`/items?${query.toString()}`),
      api.get<TaxClass[]>('/tax-classes'),
      api.get<Category[]>('/categories?active=true'),
    ]);
    setItems(itemList);
    setTaxClasses(taxClassList);
    setCategories(categoryList);
  }

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  function openNew() {
    setEditingItem(null);
    setForm(emptyForm);
    setError(null);
    setShowForm(true);
  }

  function openEdit(item: Item) {
    setEditingItem(item);
    setForm(toForm(item));
    setError(null);
    setShowForm(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    const payload = {
      code: form.code,
      name: form.name,
      size: form.size || undefined,
      unit: form.unit,
      categoryId: form.categoryId || undefined,
      mrpPaise: form.mrpPaise ? Math.round(Number(form.mrpPaise) * 100) : undefined,
      shelfLifeDays: form.shelfLifeDays ? Number(form.shelfLifeDays) : undefined,
      reorderLevel: form.reorderLevel ? Number(form.reorderLevel) : undefined,
      taxClassId: form.taxClassId || undefined,
      trackBatches: form.trackBatches,
    };
    try {
      if (editingItem) {
        await api.patch(`/items/${editingItem.id}`, payload);
      } else {
        await api.post('/items', payload);
      }
      setShowForm(false);
      setEditingItem(null);
      await reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save item');
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive() {
    if (!editingItem) return;
    setError(null);
    setSaving(true);
    try {
      await api.patch(`/items/${editingItem.id}`, { active: !editingItem.active });
      setShowForm(false);
      setEditingItem(null);
      await reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not update item');
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="top">
        <h1>Items</h1>
        <div style={{ flex: 1 }} />
        <input className="in" style={{ width: 240 }} placeholder="Search name or code" value={search} onChange={(e) => setSearch(e.target.value)} />
        <button className="btn p" onClick={() => (showForm ? setShowForm(false) : openNew())}>
          {showForm ? 'Cancel' : 'Add item'}
        </button>
      </div>
      <div className="body">
        <div className="card" style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
          <table className="tbl">
            <thead>
              <tr>
                <SortTh label="Item" sortKey="item" sort={sortableItems.sort} onSort={sortableItems.toggle} />
                <SortTh label="Category" sortKey="category" sort={sortableItems.sort} onSort={sortableItems.toggle} />
                <SortTh label="MRP" sortKey="mrp" align="r" sort={sortableItems.sort} onSort={sortableItems.toggle} />
                <SortTh label="Batches" sortKey="tracking" align="r" sort={sortableItems.sort} onSort={sortableItems.toggle} />
                <th></th>
              </tr>
            </thead>
            <tbody>
              {sortableItems.rows.map((item) => (
                <tr key={item.id} className={editingItem?.id === item.id ? 'sel' : ''}>
                  <td>
                    <b>{item.name}</b>
                    {!item.active && <span className="pill n" style={{ marginLeft: 6 }}>Inactive</span>}
                    {item.size && <div className="muted" style={{ fontSize: 12.5 }}>{item.size}</div>}
                    <div className="muted" style={{ fontSize: 12 }}>{item.code}</div>
                  </td>
                  <td>{item.category ? <span className="pill n">{item.category.name}</span> : <span className="muted">—</span>}</td>
                  <td className="r">{formatPaise(item.mrpPaise)}</td>
                  <td className="r muted">{item.trackBatches ? 'Tracked' : 'Not tracked'}</td>
                  <td><button type="button" className="btn" onClick={() => openEdit(item)}>Edit</button></td>
                </tr>
              ))}
              {items.length === 0 && (
                <tr><td colSpan={5} className="muted" style={{ padding: 20, textAlign: 'center' }}>No items yet</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {showForm && (
          <form onSubmit={handleSubmit} className="card" style={{ width: 400, flex: 'none', padding: 18, display: 'flex', flexDirection: 'column', gap: 11, overflow: 'auto' }}>
            <div style={{ fontSize: 16, fontWeight: 700 }}>{editingItem ? `Edit ${editingItem.name}` : 'Add item'}</div>
            {error && <div className="error-banner">{error}</div>}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <label className="lbl" htmlFor="category">Category</label>
                <select id="category" className="in" value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value })}>
                  <option value="">—</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="lbl" htmlFor="taxClass">Tax class</label>
                <select id="taxClass" className="in" value={form.taxClassId} onChange={(e) => setForm({ ...form, taxClassId: e.target.value })}>
                  <option value="">—</option>
                  {taxClasses.map((tc) => (
                    <option key={tc.id} value={tc.id}>{tc.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="lbl" htmlFor="code">Item code</label>
                <input id="code" className="in" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} required />
              </div>
              <div>
                <label className="lbl" htmlFor="unit">Unit</label>
                <input id="unit" className="in" placeholder="pack, nos" value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} required />
              </div>
              <div style={{ gridColumn: 'span 2' }}>
                <label className="lbl" htmlFor="name">Name</label>
                <input id="name" className="in" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
              </div>
              <div>
                <label className="lbl" htmlFor="size">Size</label>
                <input id="size" className="in" placeholder="500 g" value={form.size} onChange={(e) => setForm({ ...form, size: e.target.value })} />
              </div>
              <div>
                <label className="lbl" htmlFor="mrp">MRP (₹, GST incl.)</label>
                <input id="mrp" className="in" type="number" step="0.01" value={form.mrpPaise} onChange={(e) => setForm({ ...form, mrpPaise: e.target.value })} />
              </div>
              <div>
                <label className="lbl" htmlFor="shelfLife">Shelf life (days)</label>
                <input id="shelfLife" className="in" type="number" value={form.shelfLifeDays} onChange={(e) => setForm({ ...form, shelfLifeDays: e.target.value })} />
              </div>
              <div>
                <label className="lbl" htmlFor="reorder">Reorder level</label>
                <input id="reorder" className="in" type="number" value={form.reorderLevel} onChange={(e) => setForm({ ...form, reorderLevel: e.target.value })} />
              </div>
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, fontWeight: 600, minHeight: 36 }}>
              <input type="checkbox" checked={form.trackBatches} onChange={(e) => setForm({ ...form, trackBatches: e.target.checked })} style={{ width: 18, height: 18 }} />
              Track batches (supplier lot and best-before)
            </label>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between' }}>
              {editingItem && (
                <button type="button" className="btn" disabled={saving} onClick={toggleActive}>
                  {editingItem.active ? 'Deactivate' : 'Activate'}
                </button>
              )}
              <div style={{ display: 'flex', gap: 8, marginLeft: 'auto' }}>
                <button type="button" className="btn" onClick={() => setShowForm(false)}>Cancel</button>
                <button type="submit" className="btn p" disabled={saving}>{saving ? 'Saving…' : 'Save item'}</button>
              </div>
            </div>
          </form>
        )}
      </div>
    </>
  );
}
