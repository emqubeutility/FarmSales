import { z } from 'zod';

// Where an order was placed. DIRECT is our own counter, phone, email or order desk.
export const ORDER_SOURCES = ['FLIPKART', 'AMAZON', 'SHOPIFY', 'DIRECT'] as const;
export const orderSourceSchema = z.enum(ORDER_SOURCES);
export type OrderSource = (typeof ORDER_SOURCES)[number];

export const ORDER_SOURCE_LABELS: Record<OrderSource, string> = {
  FLIPKART: 'Flipkart',
  AMAZON: 'Amazon',
  SHOPIFY: 'Shopify',
  DIRECT: 'Direct',
};

// Platforms that can be given reserved stock by staff. Direct orders reserve stock only when taken.
export const PLATFORM_SOURCES = ['FLIPKART', 'AMAZON', 'SHOPIFY'] as const;
export type PlatformSource = (typeof PLATFORM_SOURCES)[number];

// Where stock can move between: free stock (null in the database) or a platform.
export type StockPool = 'FREE' | PlatformSource;
export const stockPoolSchema = z.enum(['FREE', ...PLATFORM_SOURCES]);

export const POOL_LABELS: Record<StockPool, string> = { FREE: 'Free stock', ...pickLabels(PLATFORM_SOURCES) };

function pickLabels(sources: readonly PlatformSource[]): Record<PlatformSource, string> {
  return Object.fromEntries(sources.map((s) => [s, ORDER_SOURCE_LABELS[s]])) as Record<PlatformSource, string>;
}

// Quantities are kept to three decimals, like the database.
export function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

// Stock on the shelf that no platform has reserved, for one batch.
export function freeQty(onHand: number, reservedTotal: number): number {
  return round3(onHand - reservedTotal);
}

// Stock a platform may still sell from one batch: reserved, minus what open orders already hold.
export function availableQty(reserved: number, held: number): number {
  return round3(reserved - held);
}

// Units an order from this source may take from one batch. A direct order takes free stock, which is
// on hand minus every reservation. A platform's order can take only its own available stock, never
// another platform's reservation or free stock.
export function holdCapacity(source: OrderSource, onHand: number, reservedTotal: number, reservedOwn: number, held: number): number {
  if (source === 'DIRECT') return Math.max(0, freeQty(onHand, reservedTotal));
  return Math.max(0, availableQty(reservedOwn, held));
}

export class TransferError extends Error {}

export interface TransferInput {
  onHand: number;
  // Reservation per platform for this batch. DIRECT is not a transfer target.
  reserved: Partial<Record<PlatformSource, number>>;
  // Reserved for direct orders. It is not a transfer target, but it is not free either.
  reservedByDirect?: number;
  held: Partial<Record<PlatformSource, number>>;
  from: StockPool;
  to: StockPool;
  qty: number;
}

// Checks a transfer of reserved stock before it is saved. Throws TransferError with a message the
// screen can show. Free to platform needs free stock. Platform to free and platform to platform need
// the source platform's available stock. Held stock never moves.
export function checkTransfer(input: TransferInput): void {
  const { onHand, reserved, reservedByDirect = 0, held, from, to, qty } = input;
  if (!(qty > 0)) throw new TransferError('Enter a quantity above zero');
  if (from === to) throw new TransferError('Choose two different places');

  const reservedAll = Object.values(reserved).reduce((sum, n) => sum + (n ?? 0), 0) + reservedByDirect;
  if (from === 'FREE') {
    const free = freeQty(onHand, reservedAll);
    if (qty > free) throw new TransferError(`Only ${free} free in this batch`);
    return;
  }

  const available = availableQty(reserved[from] ?? 0, held[from] ?? 0);
  if (qty > available) {
    throw new TransferError(`Only ${Math.max(0, available)} can move out of ${POOL_LABELS[from]}. The rest is held by open orders.`);
  }
}

// A transfer of reserved stock for one batch. Free stock is 'FREE'.
export const transferStockSchema = z
  .object({
    itemId: z.string().min(1),
    batchId: z.string().min(1),
    from: stockPoolSchema,
    to: stockPoolSchema,
    qty: z.number().positive('Enter a quantity above zero'),
    note: z.string().trim().max(200, 'Note can be 200 characters at most').optional(),
  })
  .refine((dto) => dto.from !== dto.to, { message: 'Choose two different places', path: ['to'] });
export type TransferStockDto = z.infer<typeof transferStockSchema>;
