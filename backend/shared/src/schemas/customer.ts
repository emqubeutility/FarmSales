import { z } from 'zod';

export const customerTypeSchema = z.enum(['RETAIL', 'B2B']);

export const createCustomerSchema = z.object({
  name: z.string().min(1),
  type: customerTypeSchema,
  gstin: z.string().optional(),
  creditLimitPaise: z.number().int().nonnegative().optional(),
  termsDays: z.number().int().nonnegative().optional(),
});

export const updateCustomerSchema = createCustomerSchema.partial().extend({
  active: z.boolean().optional(),
});

export type CustomerType = z.infer<typeof customerTypeSchema>;
export type CreateCustomerDto = z.infer<typeof createCustomerSchema>;
export type UpdateCustomerDto = z.infer<typeof updateCustomerSchema>;
