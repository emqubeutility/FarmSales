import { z } from 'zod';

export const createTaxClassSchema = z.object({
  name: z.string().min(1),
  hsn: z.string().optional(),
});

export const updateTaxClassSchema = createTaxClassSchema.partial();

// Effective-dated: adding a rate never alters past bills, per HANDOVER.md section 2.
export const createTaxRateSchema = z.object({
  ratePct: z.number().min(0).max(100),
  effectiveFrom: z.coerce.date(),
});

export type CreateTaxClassDto = z.infer<typeof createTaxClassSchema>;
export type UpdateTaxClassDto = z.infer<typeof updateTaxClassSchema>;
export type CreateTaxRateDto = z.infer<typeof createTaxRateSchema>;
