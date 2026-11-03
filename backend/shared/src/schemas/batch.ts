import { z } from 'zod';

// Corrects a batch's best-before date (for example, a wrong date entered at receiving). Null clears
// it. Every change is written to the audit log, so the old date is never lost.
export const updateBatchSchema = z.object({
  bestBefore: z.coerce.date().nullable(),
});

export type UpdateBatchDto = z.infer<typeof updateBatchSchema>;
