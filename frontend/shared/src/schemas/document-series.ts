import { z } from 'zod';

export const createDocumentSeriesSchema = z.object({
  prefix: z.string().min(1),
  nextNo: z.number().int().positive().default(1),
});

// prefix is intentionally not editable — it's hardcoded at the call sites that allocate numbers
// (SalesService picks "MK-"/"WH-" by salesPoint, and CreditNote and order numbers use their own), so
// renaming it would silently break those. Only nextNo can be corrected after setup.
export const updateDocumentSeriesSchema = z.object({
  nextNo: z.number().int().positive(),
});

export type CreateDocumentSeriesDto = z.infer<typeof createDocumentSeriesSchema>;
export type UpdateDocumentSeriesDto = z.infer<typeof updateDocumentSeriesSchema>;
