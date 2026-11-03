import { z } from 'zod';

export const refundModeSchema = z.enum(['CASH', 'UPI']);
export const returnDispositionSchema = z.enum(['REFUND', 'CREDIT_NOTE']);

// Points at the exact SaleLineBatch being reversed, not just an item — a line can span more than
// one batch (FEFO). restock=false is a write-off (e.g. damaged goods): refunded/credited the same
// way, but the stock never goes back in; true restocks the same batch it came from.
export const returnLineInputSchema = z.object({
  saleLineBatchId: z.string().uuid(),
  qty: z.number().positive(),
  restock: z.boolean().default(true),
});

// An "exchange" (HANDOVER.md section 4) isn't a third disposition — it's CREDIT_NOTE followed by
// a new sale paid with that note.
export const createReturnSchema = z.object({
  saleId: z.string().uuid(),
  disposition: returnDispositionSchema,
  refundMode: refundModeSchema.optional(), // required when disposition = REFUND
  customerId: z.string().uuid().optional(), // only meaningful when disposition = CREDIT_NOTE
  reason: z.string().optional(),
  lines: z.array(returnLineInputSchema).min(1),
});

export type ReturnLineInput = z.infer<typeof returnLineInputSchema>;
export type CreateReturnDto = z.infer<typeof createReturnSchema>;
export type ReturnDisposition = z.infer<typeof returnDispositionSchema>;
export type RefundMode = z.infer<typeof refundModeSchema>;
