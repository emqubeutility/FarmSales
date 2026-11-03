import { z } from 'zod';

export const paymentModeSchema = z.enum(['CREDIT', 'CASH', 'UPI']);

// qtyBase/ratePaise are per the item's base unit (kg, nos, ...); ratePaise is ex-GST, matching
// item-level weighted-average costing (HANDOVER.md section 2) — GST is reclaimable, not part of
// inventory cost. supplierLot/mfgDate/bestBefore only matter when the item tracks batches, but
// they're accepted either way since every receipt still gets an internal batch record.
export const goodsReceiptLineInputSchema = z.object({
  itemId: z.string().uuid(),
  receivedAs: z.string().optional(),
  qtyBase: z.number().positive(),
  ratePaise: z.number().int().nonnegative(),
  taxRatePct: z.number().min(0).max(100),
  supplierLot: z.string().optional(),
  mfgDate: z.coerce.date().optional(),
  bestBefore: z.coerce.date().optional(),
});

export const createGoodsReceiptSchema = z.object({
  supplierId: z.string().uuid(),
  supplierBillNo: z.string().min(1),
  billDate: z.coerce.date(),
  paymentMode: paymentModeSchema,
  lines: z.array(goodsReceiptLineInputSchema).min(1),
});

// Editing a receipt only lets you correct an existing line's own values (qty, rate, tax, lot,
// best-before) — not add/remove lines or change which item a line points at. That keeps the
// stock-reversal math exact (see StockService.reverseReceipt) and matches the "fix a typo before
// anything consumed it" use case; a bigger correction should be void-and-re-enter instead.
export const updateGoodsReceiptLineSchema = z.object({
  lineId: z.string().uuid(),
  receivedAs: z.string().optional(),
  qtyBase: z.number().positive().optional(),
  ratePaise: z.number().int().nonnegative().optional(),
  taxRatePct: z.number().min(0).max(100).optional(),
  supplierLot: z.string().optional(),
  bestBefore: z.coerce.date().optional(),
});

export const updateGoodsReceiptSchema = z.object({
  supplierBillNo: z.string().min(1).optional(),
  billDate: z.coerce.date().optional(),
  paymentMode: paymentModeSchema.optional(),
  lines: z.array(updateGoodsReceiptLineSchema).optional(),
});

export type GoodsReceiptLineInput = z.infer<typeof goodsReceiptLineInputSchema>;
export type CreateGoodsReceiptDto = z.infer<typeof createGoodsReceiptSchema>;
export type UpdateGoodsReceiptLineInput = z.infer<typeof updateGoodsReceiptLineSchema>;
export type UpdateGoodsReceiptDto = z.infer<typeof updateGoodsReceiptSchema>;
