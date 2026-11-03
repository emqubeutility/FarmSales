// FEFO (first expiry, first out) allocation. Server-side only — never trust a client-supplied
// batch pick.

export type BatchStatus = 'active' | 'hold';

export interface FefoBatch {
  batchId: string;
  qty: number;
  bestBefore: Date;
  status?: BatchStatus;
}

export interface FefoAllocation {
  batchId: string;
  qty: number;
}

export class InsufficientStockError extends Error {
  constructor(public needed: number, public available: number) {
    super(`Insufficient stock: needed ${needed}, available ${available}`);
  }
}

/**
 * Allocates `qty` units across `batches`, earliest `bestBefore` first. Batches on hold are
 * skipped. A single line can span more than one batch. Throws InsufficientStockError when the
 * eligible batches cannot cover `qty`.
 */
export function allocateFefo(batches: FefoBatch[], qty: number): FefoAllocation[] {
  if (qty <= 0) return [];

  const eligible = batches
    .filter((b) => (b.status ?? 'active') === 'active' && b.qty > 0)
    .sort((a, b) => a.bestBefore.getTime() - b.bestBefore.getTime());

  const available = eligible.reduce((sum, b) => sum + b.qty, 0);
  if (available < qty) {
    throw new InsufficientStockError(qty, available);
  }

  const allocations: FefoAllocation[] = [];
  let remaining = qty;
  for (const batch of eligible) {
    if (remaining <= 0) break;
    const take = Math.min(batch.qty, remaining);
    allocations.push({ batchId: batch.batchId, qty: take });
    remaining -= take;
  }
  return allocations;
}
