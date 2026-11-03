import { z } from 'zod';

export const createCategorySchema = z.object({
  name: z.string().trim().min(1),
});

export const updateCategorySchema = z.object({
  name: z.string().trim().min(1).optional(),
  active: z.boolean().optional(),
});

export type CreateCategoryDto = z.infer<typeof createCategorySchema>;
export type UpdateCategoryDto = z.infer<typeof updateCategorySchema>;
