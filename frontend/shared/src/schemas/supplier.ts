import { z } from 'zod';

export const createSupplierSchema = z.object({
  name: z.string().min(1),
  gstin: z.string().optional(),
});

export type CreateSupplierDto = z.infer<typeof createSupplierSchema>;
