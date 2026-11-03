import { z } from 'zod';

export const createZoneSchema = z.object({
  name: z.string().min(1),
  pincodes: z.string().optional(),
  feePaise: z.number().int().nonnegative(),
  freeFromPaise: z.number().int().nonnegative(),
});

export const updateZoneSchema = createZoneSchema.partial().extend({
  active: z.boolean().optional(),
});

export type CreateZoneDto = z.infer<typeof createZoneSchema>;
export type UpdateZoneDto = z.infer<typeof updateZoneSchema>;
