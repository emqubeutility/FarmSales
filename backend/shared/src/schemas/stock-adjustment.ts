import { z } from 'zod';

// Who approves adjustments/counts is still an open decision (HANDOVER.md section 9) — for now
// any OWNER/WAREHOUSE user can record one; the reason text is required so there's always a
// human-readable audit trail regardless of who gets approval authority later.
export const createStockAdjustmentSchema = z.object({
  itemId: z.string().uuid(),
  batchId: z.string().uuid(),
  qtyDelta: z.number().refine((v) => v !== 0, 'qtyDelta must not be zero'),
  reason: z.string().min(1),
});

export type CreateStockAdjustmentDto = z.infer<typeof createStockAdjustmentSchema>;
