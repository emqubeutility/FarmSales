import { z } from 'zod';
import { channelSchema } from './channel-discount.js';

export const salesPointSchema = z.enum(['MARKET_STALL', 'WAREHOUSE_COUNTER']);

// CASH/UPI/CREDIT_NOTE are implemented; B2B_CREDIT is accepted at the schema level (per
// HANDOVER.md's day-1 decision) but rejected by the service until B2B invoicing (phase 7) lands.
export const salePaymentModeSchema = z.enum(['CASH', 'UPI', 'CREDIT_NOTE', 'B2B_CREDIT']);

// Packs are sold by their own label. A line from scanned packs lists their codes (unitCodes), all
// from one batch, and its qty is the number of codes. A line with no codes is picked oldest batch
// first by the server, and a client never chooses that batch.
export const saleLineInputSchema = z
  .object({
    itemId: z.string().uuid(),
    qty: z.number().positive(),
    batchId: z.string().uuid().optional(),
    unitCodes: z.array(z.string().min(1)).optional(),
  })
  .refine((l) => !l.unitCodes || (l.batchId !== undefined && l.unitCodes.length === l.qty), {
    message: 'Scanned packs must come from one batch, and the quantity must equal the number of pack labels',
  });

export const salePaymentInputSchema = z.object({
  mode: salePaymentModeSchema,
  amountPaise: z.number().int().positive(),
  reference: z.string().optional(),
  creditNoteId: z.string().uuid().optional(), // required when mode = CREDIT_NOTE
});

export const holdSaleSchema = z.object({
  salesPoint: salesPointSchema,
  channel: channelSchema,
  discountPct: z.number().min(0),
  lines: z.array(saleLineInputSchema).min(1),
});

// A bill number is allocated here, not at hold — HANDOVER.md section 5 non-negotiable.
export const finalizeSaleSchema = holdSaleSchema.extend({
  customerPhone: z.string().regex(/^[6-9]\d{9}$/, 'Enter a valid 10-digit mobile number'),
  payments: z.array(salePaymentInputSchema).min(1),
});

export const resumeFinalizeSaleSchema = z.object({
  customerPhone: z.string().regex(/^[6-9]\d{9}$/, 'Enter a valid 10-digit mobile number'),
  payments: z.array(salePaymentInputSchema).min(1),
});

// Only for a HELD sale — no stock has moved yet, so a full line replacement is safe. A FINALIZED
// sale can't be edited this way; void it instead (see SalesService.void).
export const updateHeldSaleSchema = z.object({
  salesPoint: salesPointSchema.optional(),
  channel: channelSchema.optional(),
  discountPct: z.number().min(0).optional(),
  lines: z.array(saleLineInputSchema).min(1).optional(),
});

export type SaleLineInput = z.infer<typeof saleLineInputSchema>;
export type SalePaymentInput = z.infer<typeof salePaymentInputSchema>;
export type HoldSaleDto = z.infer<typeof holdSaleSchema>;
export type FinalizeSaleDto = z.infer<typeof finalizeSaleSchema>;
export type ResumeFinalizeSaleDto = z.infer<typeof resumeFinalizeSaleSchema>;
export type UpdateHeldSaleDto = z.infer<typeof updateHeldSaleSchema>;
