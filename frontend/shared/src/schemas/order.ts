import { z } from 'zod';
import { channelSchema } from './channel-discount.js';
import { salesPointSchema, salePaymentModeSchema } from './sale.js';

export const orderPaymentPlanSchema = z.enum(['PREPAID', 'COD', 'UPI_ON_DELIVERY']);

// What the delivery staff actually collected at the door — distinct from paymentPlan, the plan
// made when the order was taken.
export const deliveryCollectionModeSchema = z.enum(['CASH', 'UPI', 'ALREADY_PAID']);

export const orderLineInputSchema = z.object({
  itemId: z.string().uuid(),
  qty: z.number().positive(),
});

// Orders don't support batch scanning (no physical label to scan over the phone).
// The server always FEFO-picks at pack time.
export const createOrderSchema = z
  .object({
    channel: channelSchema,
    salesPoint: salesPointSchema,
    paymentPlan: orderPaymentPlanSchema,
    prepaidMode: salePaymentModeSchema.optional(), // required when paymentPlan = PREPAID
    prepaidReference: z.string().optional(),
    customerId: z.string().uuid().optional(),
    customerName: z.string().min(1),
    customerPhone: z.string().optional(),
    deliveryAddress: z.string().optional(),
    zoneId: z.string().uuid().optional(),
    discountPct: z.number().min(0),
    lines: z.array(orderLineInputSchema).min(1),
  })
  .refine((dto) => dto.paymentPlan !== 'PREPAID' || !!dto.prepaidMode, {
    message: 'prepaidMode is required when paymentPlan is PREPAID',
    path: ['prepaidMode'],
  });

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
