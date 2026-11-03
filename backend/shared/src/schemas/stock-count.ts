import { z } from 'zod';

// Opening a count snapshots the current system qty per batch for the chosen items; the counter
// then overwrites countedQty per line, and closing applies the variance (countedQty - systemQty)
// as a COUNT stock movement per HANDOVER.md's stock_count / stock_count_line tables.
export const createStockCountSchema = z.object({
  itemIds: z.array(z.string().uuid()).min(1),
});

export const setStockCountLinesSchema = z.object({
  lines: z
    .array(
      z.object({
        lineId: z.string().uuid(),
        countedQty: z.number().nonnegative(),
      }),
    )
    .min(1),
});

export type CreateStockCountDto = z.infer<typeof createStockCountSchema>;
export type SetStockCountLinesDto = z.infer<typeof setStockCountLinesSchema>;
