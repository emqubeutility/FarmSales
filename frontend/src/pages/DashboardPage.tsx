import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { formatPaise, formatDate } from '../lib/format.js';
import { SortTh, useTableSort } from '../lib/table-sort.js';

interface Sale {
  id: string;
  number: string | null;
  status: 'HELD' | 'FINALIZED' | 'VOID';
  totalPaise: number | null;
  createdAt: string;
  channel: string;
}

const recentSortValues = {
  bill: (s: Sale) => s.number,
  channel: (s: Sale) => s.channel,
  date: (s: Sale) => new Date(s.createdAt),
  total: (s: Sale) => s.totalPaise,
};

export function DashboardPage() {
  const [sales, setSales] = useState<Sale[]>([]);
  const recent = useTableSort(sales, recentSortValues);

  useEffect(() => {
    api.get<Sale[]>('/sales').then(setSales);
  }, []);

  const finalized = sales.filter((s) => s.status === 'FINALIZED');
  const todayTotalPaise = finalized.reduce((sum, s) => sum + (s.totalPaise ?? 0), 0);

  return (
    <>
      <div className="top">
        <h1>Dashboard</h1>
      </div>
      <div className="body" style={{ flexDirection: 'column' }}>
        <div style={{ display: 'flex', gap: 16 }}>
          <div className="card" style={{ flex: 1, padding: 16 }}>
            <div className="muted" style={{ fontSize: 13 }}>Sales recorded</div>
            <div style={{ fontSize: 28, fontWeight: 700 }}>{finalized.length}</div>
          </div>
          <div className="card" style={{ flex: 1, padding: 16 }}>
            <div className="muted" style={{ fontSize: 13 }}>Total billed</div>
            <div style={{ fontSize: 28, fontWeight: 700 }}>{formatPaise(todayTotalPaise)}</div>
          </div>
          <div className="card" style={{ flex: 1, padding: 16 }}>
            <div className="muted" style={{ fontSize: 13 }}>Held bills</div>
            <div style={{ fontSize: 28, fontWeight: 700 }}>{sales.filter((s) => s.status === 'HELD').length}</div>
          </div>
        </div>

        <div className="card" style={{ marginTop: 16, overflow: 'hidden' }}>
          <table className="tbl">
            <thead>
              <tr>
                <SortTh label="Bill" sortKey="bill" sort={recent.sort} onSort={recent.toggle} />
                <SortTh label="Channel" sortKey="channel" sort={recent.sort} onSort={recent.toggle} />
                <SortTh label="Date" sortKey="date" sort={recent.sort} onSort={recent.toggle} />
                <SortTh label="Total" sortKey="total" align="r" sort={recent.sort} onSort={recent.toggle} />
              </tr>
            </thead>
            <tbody>
              {recent.rows.slice(0, 20).map((s) => (
                <tr key={s.id}>
                  <td>{s.number ?? <span className="pill a">Held</span>}</td>
                  <td className="muted">{s.channel}</td>
                  <td className="muted">{formatDate(s.createdAt)}</td>
                  <td className="r">{formatPaise(s.totalPaise)}</td>
                </tr>
              ))}
              {sales.length === 0 && (
                <tr><td colSpan={4} className="muted" style={{ padding: 20, textAlign: 'center' }}>No sales yet — head to <Link to="/pos">POS</Link></td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
