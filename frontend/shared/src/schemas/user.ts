import { z } from 'zod';

export const roleSchema = z.enum(['OWNER', 'CASHIER', 'WAREHOUSE', 'DELIVERY']);

export const createUserSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(8),
  roles: z.array(roleSchema).min(1),
});

export const updateUserSchema = z.object({
  name: z.string().min(1).optional(),
  roles: z.array(roleSchema).min(1).optional(),
  active: z.boolean().optional(),
  password: z.string().min(8).optional(),
});

export type Role = z.infer<typeof roleSchema>;
export type CreateUserDto = z.infer<typeof createUserSchema>;
export type UpdateUserDto = z.infer<typeof updateUserSchema>;
