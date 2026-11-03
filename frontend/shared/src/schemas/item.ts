import { z } from 'zod';

// Every item is a ready-made product sold in its pack. Category (Rice, Atta, Ghee ...) is chosen
// from the list the owner maintains in Settings.
export const createItemSchema = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
  size: z.string().optional(),
  unit: z.string().min(1),
  ean13: z.string().optional(),
  taxClassId: z.string().uuid().optional(),
  categoryId: z.string().uuid().optional(),
  mrpPaise: z.number().int().nonnegative().optional(),
  shelfLifeDays: z.number().int().positive().optional(),
  reorderLevel: z.number().int().nonnegative().optional(),
  trackBatches: z.boolean().default(true),
});

export const updateItemSchema = createItemSchema.partial().extend({
  active: z.boolean().optional(),
});

const booleanQueryParam = z.preprocess(
  (v) => (typeof v === 'string' ? v === 'true' : v),
  z.boolean().optional(),
);

export const listItemsQuerySchema = z.object({
  search: z.string().optional(),
  categoryId: z.string().uuid().optional(),
  active: booleanQueryParam,
});

export type CreateItemDto = z.infer<typeof createItemSchema>;
export type UpdateItemDto = z.infer<typeof updateItemSchema>;
export type ListItemsQuery = z.infer<typeof listItemsQuerySchema>;
