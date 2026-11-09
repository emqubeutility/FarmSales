import { z } from 'zod';
import { citySchema, landmarkSchema, pincodeSchema, stateSchema } from './address.js';
import { orderAddressSchema, orderCustomerNameSchema, orderPhoneSchema } from './order.js';

export const customerTypeSchema = z.enum(['RETAIL', 'B2B']);

// GSTIN is 15 characters: two digits for the state, the PAN, then a check. Only the shape is checked here.
export const gstinSchema = z
  .string()
  .trim()
  .regex(/^[0-9A-Z]{15}$/, 'GSTIN is 15 characters: capital letters and digits');

export const createCustomerSchema = z.object({
  name: orderCustomerNameSchema,
  type: customerTypeSchema,
  phone: orderPhoneSchema.optional(),
  addressLine: orderAddressSchema.optional(),
  landmark: landmarkSchema.optional(),
  city: citySchema.optional(),
  state: stateSchema.optional(),
  pincode: pincodeSchema.optional(),
  gstin: gstinSchema.optional(),
  creditLimitPaise: z.number().int().nonnegative().optional(),
  termsDays: z.number().int().nonnegative().max(365, 'Payment terms can be 365 days at most').optional(),
});

// On an update, a field can be cleared: send null for it. Left out, it is not changed.
const clearable = <T extends z.ZodTypeAny>(schema: T) => schema.nullable().optional();

export const updateCustomerSchema = createCustomerSchema.partial().extend({
  phone: clearable(orderPhoneSchema),
  addressLine: clearable(orderAddressSchema),
  landmark: clearable(landmarkSchema),
  city: clearable(citySchema),
  state: clearable(stateSchema),
  pincode: clearable(pincodeSchema),
  gstin: clearable(gstinSchema),
  creditLimitPaise: z.number().int().nonnegative().nullable().optional(),
  termsDays: z.number().int().nonnegative().max(365, 'Payment terms can be 365 days at most').nullable().optional(),
  active: z.boolean().optional(),
});

export type CustomerType = z.infer<typeof customerTypeSchema>;
export type CreateCustomerDto = z.infer<typeof createCustomerSchema>;
export type UpdateCustomerDto = z.infer<typeof updateCustomerSchema>;
