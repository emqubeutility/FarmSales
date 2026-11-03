import { describe, expect, it } from 'vitest';
import { allocateFefo, InsufficientStockError } from './fefo.js';

const d = (s: string) => new Date(s);

describe('allocateFefo', () => {
  it('allocates from a single batch when it covers the qty', () => {
    const batches = [{ batchId: 'B1', qty: 10, bestBefore: d('2027-01-01') }];
    expect(allocateFefo(batches, 4)).toEqual([{ batchId: 'B1', qty: 4 }]);
  });

  it('spans two batches, earliest expiry first', () => {
    const batches = [
      { batchId: 'LATER', qty: 20, bestBefore: d('2027-06-01') },
      { batchId: 'EARLIER', qty: 5, bestBefore: d('2027-01-01') },
    ];
    expect(allocateFefo(batches, 8)).toEqual([
      { batchId: 'EARLIER', qty: 5 },
      { batchId: 'LATER', qty: 3 },
    ]);
  });

  it('throws InsufficientStockError when eligible stock cannot cover qty', () => {
    const batches = [{ batchId: 'B1', qty: 3, bestBefore: d('2027-01-01') }];
    expect(() => allocateFefo(batches, 5)).toThrow(InsufficientStockError);
  });

  it('skips held batches', () => {
    const batches = [
      { batchId: 'HELD', qty: 100, bestBefore: d('2027-01-01'), status: 'hold' as const },
      { batchId: 'ACTIVE', qty: 10, bestBefore: d('2027-06-01') },
    ];
    expect(allocateFefo(batches, 4)).toEqual([{ batchId: 'ACTIVE', qty: 4 }]);
  });

  it('returns an empty allocation for zero qty', () => {
    const batches = [{ batchId: 'B1', qty: 10, bestBefore: d('2027-01-01') }];
    expect(allocateFefo(batches, 0)).toEqual([]);
  });
});
