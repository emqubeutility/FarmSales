import { ConflictException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { ReservationsService } from './reservations.service.js';

// Candidates are what StockService.candidatesFor returns: the capacity each batch gives to the pool.
function setup(candidates: { batchId: string; qty: number; bestBefore: Date }[]) {
  const tx = {
    channelReservation: {
      update: vi.fn(() => Promise.resolve({})),
      upsert: vi.fn(() => Promise.resolve({})),
    },
    channelReservationEvent: { create: vi.fn(() => Promise.resolve({})) },
  };
  const stock = {
    candidatesFor: vi.fn(() => Promise.resolve(candidates)),
    recordMovement: vi.fn(() => Promise.resolve({})),
  };
  const service = new ReservationsService({} as never, stock as never);
  return { tx, stock, service };
}

const soon = new Date('2027-01-01');

describe('ReservationsService.hold', () => {
  it('refuses a platform order larger than what the platform has available', async () => {
    const { tx, service } = setup([{ batchId: 'B1', qty: 5, bestBefore: soon }]);
    await expect(service.hold(tx as never, { itemId: 'I1', qty: 8, source: 'FLIPKART', refId: 'O1' })).rejects.toThrow(ConflictException);
    await expect(service.hold(tx as never, { itemId: 'I1', qty: 8, source: 'FLIPKART', refId: 'O1' })).rejects.toThrow(
      'Only 5 available for Flipkart. Move stock to Flipkart first.',
    );
  });

  it('holds a platform order from its own reservation only, and raises held', async () => {
    const { tx, stock, service } = setup([{ batchId: 'B1', qty: 10, bestBefore: soon }]);
    const allocations = await service.hold(tx as never, { itemId: 'I1', qty: 4, source: 'AMAZON', refId: 'O1' });
    expect(stock.candidatesFor).toHaveBeenCalledWith(tx, 'I1', 'AMAZON');
    expect(allocations).toEqual([{ batchId: 'B1', qty: 4 }]);
    expect(tx.channelReservation.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { heldQty: { increment: 4 } } }),
    );
    expect(tx.channelReservation.upsert).not.toHaveBeenCalled();
  });

  it('reserves free stock for a direct order and holds it at once', async () => {
    const { tx, stock, service } = setup([{ batchId: 'B1', qty: 6, bestBefore: soon }]);
    await service.hold(tx as never, { itemId: 'I1', qty: 6, source: 'DIRECT', refId: 'O2' });
    expect(stock.candidatesFor).toHaveBeenCalledWith(tx, 'I1', 'FREE');
    expect(tx.channelReservation.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ create: expect.objectContaining({ reservedQty: 6, heldQty: 6 }) }),
    );
  });
});

describe('ReservationsService.consume', () => {
  it('moves held stock out of the warehouse and lowers both reserved and held', async () => {
    const { tx, stock, service } = setup([]);
    await service.consume(tx as never, { itemId: 'I1', batchId: 'B1', source: 'FLIPKART', qty: 3, refId: 'O1' });
    expect(stock.recordMovement).toHaveBeenCalledWith(tx, expect.objectContaining({ qtyDelta: -3, reason: 'SALE' }));
    expect(tx.channelReservation.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { heldQty: { decrement: 3 }, reservedQty: { decrement: 3 } } }),
    );
  });
});
