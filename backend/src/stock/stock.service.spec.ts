import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { StockService } from './stock.service.js';

function makeTx() {
  const ledgerRows: unknown[] = [];
  const balances = new Map<string, Prisma.Decimal>();

  const tx = {
    stockLedger: {
      create: vi.fn((args: { data: Record<string, unknown> }) => {
        ledgerRows.push(args.data);
        return Promise.resolve(args.data);
      }),
    },
    stockBalance: {
      upsert: vi.fn((args: { where: { itemId_batchId: { itemId: string; batchId: string } }; update: { qty: { increment: number } } }) => {
        const key = `${args.where.itemId_batchId.itemId}:${args.where.itemId_batchId.batchId}`;
        const current = balances.get(key) ?? new Prisma.Decimal(0);
        const next = current.add(args.update.qty.increment);
        balances.set(key, next);
        return Promise.resolve({ qty: next });
      }),
      findMany: vi.fn((args: { where: { itemId: string } }) => {
        const rows = [...balances.entries()]
          .filter(([key]) => key.startsWith(`${args.where.itemId}:`))
          .map(([key, qty]) => {
            const [, batchId] = key.split(':');
            return { itemId: args.where.itemId, batchId, qty, batch: batchMeta.get(batchId) };
          })
          .filter((r) => r.qty.greaterThan(0));
        return Promise.resolve(rows);
      }),
    },
    itemCost: {
      findUnique: vi.fn((args: { where: { itemId: string } }) => Promise.resolve(itemCosts.get(args.where.itemId) ?? null)),
      upsert: vi.fn(
        (args: {
          where: { itemId: string };
          create: { itemId: string; avgCostPaise: number; qtyOnHand: number };
          update: { qtyOnHand: { increment: number } };
        }) => {
          const existing = itemCosts.get(args.where.itemId);
          const next = existing
            ? { ...existing, qtyOnHand: existing.qtyOnHand.add(args.update.qtyOnHand.increment) }
            : { itemId: args.where.itemId, avgCostPaise: args.create.avgCostPaise, qtyOnHand: new Prisma.Decimal(args.create.qtyOnHand) };
          itemCosts.set(args.where.itemId, next);
          return Promise.resolve(next);
        },
      ),
      update: vi.fn((args: { where: { itemId: string }; data: { avgCostPaise: number } }) => {
        const existing = itemCosts.get(args.where.itemId);
        const next = { ...existing, ...args.data } as { itemId: string; avgCostPaise: number; qtyOnHand: Prisma.Decimal };
        itemCosts.set(args.where.itemId, next);
        return Promise.resolve(next);
      }),
    },
  };

  const batchMeta = new Map<string, { status: string; bestBefore: Date | null; receivedOn: Date | null }>();
  const itemCosts = new Map<string, { itemId: string; avgCostPaise: number; qtyOnHand: Prisma.Decimal }>();
  return { tx, balances, batchMeta, itemCosts };
}

describe('StockService.receiveStock', () => {
  it('increments the balance and sets the initial weighted-average cost', async () => {
    const { tx } = makeTx();
    const service = new StockService();

    const cost = await service.receiveStock(tx as never, {
      itemId: 'item-1',
      batchId: 'batch-1',
      qty: 100,
      unitCostPaise: 4400,
      refType: 'GoodsReceipt',
      refId: 'gr-1',
    });

    expect(cost).toEqual({ itemId: 'item-1', avgCostPaise: 4400, qtyOnHand: new Prisma.Decimal(100) });
    expect(tx.stockLedger.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ reason: 'RECEIPT', qtyDelta: 100 }) }),
    );
  });

  it('recomputes the weighted average when receiving more stock at a different cost', async () => {
    const { tx, itemCosts } = makeTx();
    itemCosts.set('item-1', { itemId: 'item-1', avgCostPaise: 4400, qtyOnHand: new Prisma.Decimal(100) });
    const service = new StockService();

    // Matches the mock's receive-stock example: 100kg @ 44.00 then 100kg @ 50.00 -> avg 47.00
    const cost = await service.receiveStock(tx as never, {
      itemId: 'item-1',
      batchId: 'batch-2',
      qty: 100,
      unitCostPaise: 5000,
      refType: 'GoodsReceipt',
      refId: 'gr-2',
    });

    expect(cost.avgCostPaise).toBe(4700);
  });
});

describe('StockService.reverseReceipt', () => {
  it('is the exact inverse of receiveStock when nothing else has moved the item since', async () => {
    const { tx } = makeTx();
    const service = new StockService();

    await service.receiveStock(tx as never, { itemId: 'item-1', batchId: 'b1', qty: 100, unitCostPaise: 4400, refType: 'GoodsReceipt', refId: 'gr-1' });
    const afterReverse = await service.reverseReceipt(tx as never, { itemId: 'item-1', batchId: 'b1', qty: 100, unitCostPaise: 4400, refType: 'GoodsReceipt', refId: 'gr-1' });

    expect(afterReverse.qtyOnHand.toNumber()).toBe(0);
    expect(afterReverse.avgCostPaise).toBe(0);
  });

  it('unwinds only its own contribution to a blended average, leaving the rest intact', async () => {
    const { tx } = makeTx();
    const service = new StockService();

    // 100kg @ 44.00 then 100kg @ 50.00 -> avg 47.00 (200kg); reversing the second receipt
    // should land exactly back at the first receipt's own state: 100kg @ 44.00.
    await service.receiveStock(tx as never, { itemId: 'item-1', batchId: 'b1', qty: 100, unitCostPaise: 4400, refType: 'GoodsReceipt', refId: 'gr-1' });
    await service.receiveStock(tx as never, { itemId: 'item-1', batchId: 'b2', qty: 100, unitCostPaise: 5000, refType: 'GoodsReceipt', refId: 'gr-2' });

    const afterReverse = await service.reverseReceipt(tx as never, { itemId: 'item-1', batchId: 'b2', qty: 100, unitCostPaise: 5000, refType: 'GoodsReceipt', refId: 'gr-2' });

    expect(afterReverse.qtyOnHand.toNumber()).toBe(100);
    expect(afterReverse.avgCostPaise).toBe(4400);
  });
});

describe('StockService.decrementFefo', () => {
  it('allocates earliest-expiry batch first and writes negative ledger entries', async () => {
    const { tx, batchMeta } = makeTx();
    const service = new StockService();

    await service.receiveStock(tx as never, { itemId: 'item-1', batchId: 'later', qty: 10, unitCostPaise: 100, refType: 'x', refId: '1' });
    await service.receiveStock(tx as never, { itemId: 'item-1', batchId: 'earlier', qty: 10, unitCostPaise: 100, refType: 'x', refId: '2' });
    batchMeta.set('later', { status: 'ACTIVE', bestBefore: new Date('2027-06-01'), receivedOn: null });
    batchMeta.set('earlier', { status: 'ACTIVE', bestBefore: new Date('2027-01-01'), receivedOn: null });

    const allocations = await service.decrementFefo(tx as never, { itemId: 'item-1', qty: 15, reason: 'SALE', refType: 'Sale', refId: 's-1' });

    expect(allocations).toEqual([
      { batchId: 'earlier', qty: 10 },
      { batchId: 'later', qty: 5 },
    ]);
  });

  it('throws ConflictException when stock is insufficient', async () => {
    const { tx, batchMeta } = makeTx();
    const service = new StockService();

    await service.receiveStock(tx as never, { itemId: 'item-1', batchId: 'b1', qty: 5, unitCostPaise: 100, refType: 'x', refId: '1' });
    batchMeta.set('b1', { status: 'ACTIVE', bestBefore: new Date('2027-01-01'), receivedOn: null });

    await expect(
      service.decrementFefo(tx as never, { itemId: 'item-1', qty: 10, reason: 'SALE', refType: 'Sale', refId: 's-1' }),
    ).rejects.toThrow(ConflictException);
  });
});
