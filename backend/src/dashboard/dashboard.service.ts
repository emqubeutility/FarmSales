import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

// The dashboard numbers. Money is whole paise. Days are India days (UTC+05:30, no daylight saving).

export type DashboardRange = 'today' | '7d' | '30d';

const DAY_MS = 86_400_000;
const IST_OFFSET_MS = 330 * 60_000;

// Midnight, India time, of the day that contains `date`, as a real instant.
export function istDayStart(date: Date): Date {
  const local = date.getTime() + IST_OFFSET_MS;
  return new Date(Math.floor(local / DAY_MS) * DAY_MS - IST_OFFSET_MS);
}

// The India calendar day as YYYY-MM-DD.
function istDayKey(date: Date): string {
  return new Date(date.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
}

// Percentage change from `before` to `now`. Null when there is nothing to compare with.
function changePct(now: number, before: number): number | null {
  if (before === 0) return now === 0 ? 0 : null;
  return Math.round(((now - before) / before) * 100);
}

interface Totals {
  salesPaise: number;
  bills: number;
  profitPaise: number;
}

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async summary(range: DashboardRange, canSeeProfit: boolean) {
    const now = new Date();
    const today = istDayStart(now);
    const days = range === 'today' ? 1 : range === '7d' ? 7 : 30;
    const start = new Date(today.getTime() - (days - 1) * DAY_MS);
    const previousStart = new Date(start.getTime() - days * DAY_MS);
    const trendStart = new Date(today.getTime() - 6 * DAY_MS);
    const fetchFrom = new Date(Math.min(previousStart.getTime(), trendStart.getTime()));
    const attentionEnd = new Date(today.getTime() + 8 * DAY_MS);

    const [sales, costs, heldBills, pendingOrders, reorderItems, stockTotals, expiring] = await Promise.all([
      this.prisma.sale.findMany({
        where: { status: 'FINALIZED', finalizedAt: { gte: fetchFrom } },
        select: {
          id: true,
          number: true,
          channel: true,
          totalPaise: true,
          taxablePaise: true,
          createdAt: true,
          finalizedAt: true,
          lines: { select: { itemId: true, qty: true, mrpPaise: true } },
          payments: { select: { mode: true } },
        },
        orderBy: { finalizedAt: 'desc' },
      }),
      this.prisma.itemCost.findMany({ select: { itemId: true, avgCostPaise: true } }),
      this.prisma.sale.count({ where: { status: 'HELD' } }),
      this.prisma.order.count({ where: { status: { in: ['NEW', 'PACKED'] } } }),
      this.prisma.item.findMany({ where: { active: true, reorderLevel: { not: null } }, select: { id: true, reorderLevel: true } }),
      this.prisma.stockBalance.groupBy({ by: ['itemId'], _sum: { qty: true } }),
      this.prisma.batch.findMany({
        where: { status: 'ACTIVE', bestBefore: { gte: today, lte: attentionEnd } },
        select: { id: true, stockBalances: { select: { qty: true } } },
      }),
    ]);

    const avgCost = new Map(costs.map((c) => [c.itemId, c.avgCostPaise]));
    const at = (s: { finalizedAt: Date | null; createdAt: Date }) => s.finalizedAt ?? s.createdAt;

    // Gross profit = taxable sales minus the cost of the items sold at their current average cost.
    // It is an estimate: the cost is the item's current average, not the cost of the exact batch sold.
    const profitOf = (s: (typeof sales)[number]) => {
      const revenue = s.taxablePaise ?? s.totalPaise ?? 0;
      const cogs = s.lines.reduce((sum, l) => sum + Math.round(Number(l.qty) * (avgCost.get(l.itemId) ?? 0)), 0);
      return revenue - cogs;
    };
    const totalsOf = (list: typeof sales): Totals => ({
      salesPaise: list.reduce((sum, s) => sum + (s.totalPaise ?? 0), 0),
      bills: list.length,
      profitPaise: list.reduce((sum, s) => sum + profitOf(s), 0),
    });

    const current = totalsOf(sales.filter((s) => at(s) >= start));
    const previous = totalsOf(sales.filter((s) => at(s) >= previousStart && at(s) < start));
    const averageOf = (t: Totals) => (t.bills === 0 ? 0 : Math.round(t.salesPaise / t.bills));

    // The last seven days, one point each, for the chart and the sparklines.
    const trend = Array.from({ length: 7 }, (_, i) => {
      const day = new Date(trendStart.getTime() + i * DAY_MS);
      const key = istDayKey(day);
      const t = totalsOf(sales.filter((s) => istDayKey(at(s)) === key));
      const label = day.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' });
      return { date: key, label, salesPaise: t.salesPaise, bills: t.bills, profitPaise: t.profitPaise };
    });

    // Top items in the chosen range, by amount sold (MRP, GST included).
    const byItem = new Map<string, { qty: number; amountPaise: number }>();
    for (const s of sales.filter((x) => at(x) >= start)) {
      for (const l of s.lines) {
        const row = byItem.get(l.itemId) ?? { qty: 0, amountPaise: 0 };
        row.qty += Number(l.qty);
        row.amountPaise += Math.round(Number(l.qty) * l.mrpPaise);
        byItem.set(l.itemId, row);
      }
    }
    const topIds = [...byItem.entries()].sort((a, b) => b[1].amountPaise - a[1].amountPaise).slice(0, 5);
    const names = topIds.length
      ? await this.prisma.item.findMany({ where: { id: { in: topIds.map(([id]) => id) } }, select: { id: true, name: true, size: true } })
      : [];
    const nameOf = new Map(names.map((n) => [n.id, n]));
    const topItems = topIds.map(([id, row]) => ({
      itemId: id,
      name: nameOf.get(id)?.name ?? 'Item',
      size: nameOf.get(id)?.size ?? null,
      qty: row.qty,
      amountPaise: row.amountPaise,
    }));

    // Needs attention: items at or below their reorder level, batches expiring within a week, orders
    // waiting to be packed or dispatched, and bills on hold.
    const stockOf = new Map(stockTotals.map((t) => [t.itemId, Number(t._sum.qty ?? 0)]));
    const lowStock = reorderItems.filter((i) => (stockOf.get(i.id) ?? 0) <= Number(i.reorderLevel)).length;
    const expiringBatches = expiring.filter((b) => b.stockBalances.reduce((sum, sb) => sum + Number(sb.qty), 0) > 0).length;

    const kpi = (value: number, before: number) => ({ value, changePct: changePct(value, before) });
    return {
      range,
      canSeeProfit,
      kpis: {
        sales: kpi(current.salesPaise, previous.salesPaise),
        bills: kpi(current.bills, previous.bills),
        averageBill: kpi(averageOf(current), averageOf(previous)),
        grossProfit: canSeeProfit ? kpi(current.profitPaise, previous.profitPaise) : null,
      },
      trend,
      topItems,
      recentSales: sales.slice(0, 5).map((s) => ({
        id: s.id,
        number: s.number,
        createdAt: at(s),
        channel: s.channel,
        totalPaise: s.totalPaise,
        paymentMode: s.payments[0]?.mode ?? null,
      })),
      attention: { lowStock, expiringBatches, pendingOrders, heldBills },
    };
  }
}
