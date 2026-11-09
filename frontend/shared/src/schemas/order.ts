import { z } from 'zod';
import { channelSchema } from './channel-discount.js';
import { citySchema, landmarkSchema, pincodeSchema, stateSchema } from './address.js';
import { salesPointSchema, salePaymentModeSchema } from './sale.js';

export const orderPaymentPlanSchema = z.enum(['PREPAID', 'COD', 'UPI_ON_DELIVERY']);

// What the delivery staff actually collected at the door — distinct from paymentPlan, the plan
// made when the order was taken.
export const deliveryCollectionModeSchema = z.enum(['CASH', 'UPI', 'ALREADY_PAID']);

export const orderLineInputSchema = z.object({
  itemId: z.string().uuid(),
  qty: z.number().positive(),
});

// Field rules shared by the order form (web) and the API. Messages are what the form shows.
export const orderCustomerNameSchema = z
  .string()
  .trim()
  .min(2, 'Enter the customer name (at least 2 characters)')
  .max(60, 'Customer name can be 60 characters at most')
  .regex(/^[\p{L}\p{M} .'&()-]+$/u, "Use letters, spaces and . ' & ( ) - only");

export const orderPhoneSchema = z
  .string()
  .trim()
  .regex(/^[6-9]\d{9}$/, 'Enter a valid 10-digit mobile number, starting with 6 to 9');

export const orderAddressSchema = z
  .string()
  .trim()
  .min(5, 'Enter the delivery address (at least 5 characters)')
  .max(200, 'Delivery address can be 200 characters at most');

// Orders don't support batch scanning (no physical label to scan over the phone).
// The server always FEFO-picks at pack time.
export const createOrderSchema = z
  .object({
    channel: channelSchema,
    salesPoint: salesPointSchema,
    paymentPlan: orderPaymentPlanSchema,
    prepaidMode: salePaymentModeSchema.optional(), // required when paymentPlan = PREPAID
    prepaidReference: z.string().trim().max(60, 'Reference can be 60 characters at most').optional(),
    customerId: z.string().uuid().optional(),
    customerName: orderCustomerNameSchema,
    customerPhone: orderPhoneSchema.optional(),
    deliveryAddress: orderAddressSchema.optional(),
    deliveryLandmark: landmarkSchema.optional(),
    deliveryCity: citySchema.optional(),
    deliveryState: stateSchema.optional(),
    deliveryPincode: pincodeSchema.optional(),
    zoneId: z.string().uuid().optional(),
    discountPct: z.number().min(0),
    lines: z.array(orderLineInputSchema).min(1, 'Add at least one item to the order'),
  })
  .refine((dto) => dto.paymentPlan !== 'PREPAID' || !!dto.prepaidMode, {
    message: 'Choose how the prepaid amount was paid',
    path: ['prepaidMode'],
  })
  .refine((dto) => !(dto.paymentPlan === 'PREPAID' && dto.prepaidMode === 'UPI') || !!dto.prepaidReference, {
    message: 'Enter the UPI reference (UTR) for the prepaid payment',
    path: ['prepaidReference'],
  })
  .refine((dto) => !dto.zoneId || !!dto.deliveryAddress, {
    message: 'Enter the delivery address for a delivery order',
    path: ['deliveryAddress'],
  })
  .refine((dto) => !dto.zoneId || !!dto.customerPhone, {
    message: 'Enter the customer mobile number for a delivery order',
    path: ['customerPhone'],
  })
  .refine((dto) => !dto.zoneId || !!dto.deliveryCity, { message: 'Enter the city', path: ['deliveryCity'] })
  .refine((dto) => !dto.zoneId || !!dto.deliveryState, { message: 'Choose the state', path: ['deliveryState'] })
  .refine((dto) => !dto.zoneId || !!dto.deliveryPincode, { message: 'Enter the 6-digit pincode', path: ['deliveryPincode'] });

export const dispatchOrderSchema = z.object({
  deliveryStaffName: z.string().optional(),
});

export const recordDeliverySchema = z
  .object({
    collectedMode: deliveryCollectionModeSchema,
    collectedAmountPaise: z.number().int().positive().optional(),
    reference: z.string().optional(),
  })
  .refine((dto) => dto.collectedMode !== 'UPI' || dto.collectedAmountPaise !== undefined, {
    message: 'collectedAmountPaise is required when collectedMode is UPI',
    path: ['collectedAmountPaise'],
  });

export const cancelOrderSchema = z.object({
  reason: z.string().optional(),
});

export type OrderPaymentPlan = z.infer<typeof orderPaymentPlanSchema>;
export type DeliveryCollectionMode = z.infer<typeof deliveryCollectionModeSchema>;
export type OrderLineInput = z.infer<typeof orderLineInputSchema>;
export type CreateOrderDto = z.infer<typeof createOrderSchema>;
export type DispatchOrderDto = z.infer<typeof dispatchOrderSchema>;
export type RecordDeliveryDto = z.infer<typeof recordDeliverySchema>;
export type CancelOrderDto = z.infer<typeof cancelOrderSchema>;
