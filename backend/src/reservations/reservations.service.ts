import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import {
  allocateFefo,
  checkTransfer,
  InsufficientStockError,
  ORDER_SOURCE_LABELS,
  TransferError,
  type FefoAllocation,
  type OrderSource,
  type TransferStockDto,
} from '@farm-sales/shared';
import { PrismaService } from '../prisma/prisma.service.js';
import { StockService } from '../stock/stock.service.js';
import type { PrismaTx } from '../common/prisma-tx.type.js';

export interface HoldParams {
  itemId: string;
  qty: number;
  source: OrderSource;
  refId: string;
}

// The stock behind one order line. Source is where the order was placed.
export interface HeldUnitParams {
  itemId: string;
  batchId: string;
  source: OrderSource;
  qty: number;
  refId: string;
}

/**
 * Warehouse stock reserved for each platform, and the holds that orders take from it. All stock is
 * physically in the warehouse. A reservation is a plan for who may sell it, so moving it changes
 * these rows and never the physical ledger. Every change writes an event with who and why.
 *
 * Callers own the transaction. Each method takes the caller's transaction client.
 */
@Injectable()
export class ReservationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stock: StockService,
  ) {}

  /**
   * Takes stock for an order line, FEFO within what this source may use. A platform order uses its
   * own reservation. A direct order uses free stock and reserves it for itself. The caller writes
   * the order-line batch rows from the returned allocations.
   */
  async hold(tx: PrismaTx, params: HoldParams): Promise<FefoAllocation[]> {
    const pool: 'FREE' | OrderSource = params.source === 'DIRECT' ? 'FREE' : params.source;
    const candidates = await this.stock.candidatesFor(tx, params.itemId, pool);
    let allocations: FefoAllocation[];
    try {
      allocations = allocateFefo(candidates, params.qty);
    } catch (err) {
      if (err instanceof InsufficientStockError) {
        const total = candidates.reduce((sum, c) => sum + c.qty, 0);
        throw new ConflictException(
          params.source === 'DIRECT'
            ? `Only ${total} free. The rest is reserved for platforms. Move stock from a platform first.`
            : `Only ${total} available for ${ORDER_SOURCE_LABELS[params.source]}. Move stock to ${ORDER_SOURCE_LABELS[params.source]} first.`,
        );
      }
      throw err;
    }

    for (const allocation of allocations) {
      const key = { itemId: params.itemId, batchId: allocation.batchId, source: params.source };
      if (params.source === 'DIRECT') {
        await tx.channelReservation.upsert({
          where: { itemId_batchId_source: key },
          create: { ...key, reservedQty: allocation.qty, heldQty: allocation.qty },
          update: { reservedQty: { increment: allocation.qty }, heldQty: { increment: allocation.qty } },
        });
      } else {
        await tx.channelReservation.update({
          where: { itemId_batchId_source: key },
          data: { heldQty: { increment: allocation.qty } },
        });
      }
      await tx.channelReservationEvent.create({
        data: {
          itemId: params.itemId,
          batchId: allocation.batchId,
          kind: 'HOLD',
          fromSource: params.source === 'DIRECT' ? null : params.source,
          toSource: params.source === 'DIRECT' ? 'DIRECT' : null,
          qty: allocation.qty,
          refType: 'Order',
          refId: params.refId,
        },
      });
    }
    return allocations;
  }

  /** Packing: the held stock leaves the warehouse. Reservation and on-hand fall together. */
  async consume(tx: PrismaTx, params: HeldUnitParams): Promise<void> {
    await this.stock.recordMovement(tx, {
      itemId: params.itemId,
      batchId: params.batchId,
      qtyDelta: -params.qty,
      reason: 'SALE',
      refType: 'Order',
      refId: params.refId,
    });
    await this.lowerReservation(tx, params, true);
    await tx.channelReservationEvent.create({
      data: {
        itemId: params.itemId,
        batchId: params.batchId,
        kind: 'CONSUME',
        fromSource: params.source,
        qty: params.qty,
        refType: 'Order',
        refId: params.refId,
      },
    });
  }

  /** Cancelled before packing: the hold ends. A direct order's own reservation goes back to free. */
  async releaseHold(tx: PrismaTx, params: HeldUnitParams): Promise<void> {
    await this.lowerReservation(tx, params, params.source === 'DIRECT');
    await tx.channelReservationEvent.create({
      data: {
        itemId: params.itemId,
        batchId: params.batchId,
        kind: 'RELEASE_HOLD',
        fromSource: params.source,
        qty: params.qty,
        refType: 'Order',
        refId: params.refId,
      },
    });
  }

  /**
   * Moves reserved stock for one batch: free to a platform, a platform back to free, or one
   * platform to another. Held stock never moves. Throws BadRequest with the reason.
   */
  async transfer(dto: TransferStockDto, userId: string) {
    return this.prisma.$transaction(async (tx) => {
      const [balance, reservations] = await Promise.all([
        tx.stockBalance.findUnique({ where: { itemId_batchId: { itemId: dto.itemId, batchId: dto.batchId } } }),
        tx.channelReservation.findMany({ where: { itemId: dto.itemId, batchId: dto.batchId } }),
      ]);
      const reserved: Partial<Record<'FLIPKART' | 'AMAZON' | 'SHOPIFY', number>> = {};
      const held: Partial<Record<'FLIPKART' | 'AMAZON' | 'SHOPIFY', number>> = {};
      let reservedByDirect = 0;
      for (const r of reservations) {
        if (r.source === 'DIRECT') {
          reservedByDirect += r.reservedQty.toNumber();
          continue;
        }
        reserved[r.source] = r.reservedQty.toNumber();
        held[r.source] = r.heldQty.toNumber();
      }
      try {
        checkTransfer({
          onHand: balance?.qty.toNumber() ?? 0,
          reserved,
          reservedByDirect,
          held,
          from: dto.from,
          to: dto.to,
          qty: dto.qty,
        });
      } catch (err) {
        if (err instanceof TransferError) throw new BadRequestException(err.message);
        throw err;
      }

      if (dto.from !== 'FREE') {
        await tx.channelReservation.update({
          where: { itemId_batchId_source: { itemId: dto.itemId, batchId: dto.batchId, source: dto.from } },
          data: { reservedQty: { decrement: dto.qty } },
        });
      }
      if (dto.to !== 'FREE') {
        await tx.channelReservation.upsert({
          where: { itemId_batchId_source: { itemId: dto.itemId, batchId: dto.batchId, source: dto.to } },
          create: { itemId: dto.itemId, batchId: dto.batchId, source: dto.to, reservedQty: dto.qty, heldQty: 0 },
          update: { reservedQty: { increment: dto.qty } },
        });
      }

      await tx.channelReservationEvent.create({
        data: {
          userId,
          itemId: dto.itemId,
          batchId: dto.batchId,
          kind: 'TRANSFER',
          fromSource: dto.from === 'FREE' ? null : dto.from,
          toSource: dto.to === 'FREE' ? null : dto.to,
          qty: dto.qty,
          note: dto.note,
        },
      });
      return { ok: true as const, from: dto.from, to: dto.to, qty: dto.qty };
    });
  }

  /** Recent reservation events for one item, newest first, with who made each change. */
  events(itemId: string, limit = 50) {
    return this.prisma.channelReservationEvent.findMany({
      where: { itemId },
      orderBy: { ts: 'desc' },
      take: Math.min(Math.max(limit, 1), 200),
      include: { user: { select: { name: true } }, batch: { select: { code: true } } },
    });
  }

  // Lowers a hold, and optionally the reservation itself, by qty for one batch and source.
  private async lowerReservation(tx: PrismaTx, params: HeldUnitParams, alsoReserved: boolean): Promise<void> {
    await tx.channelReservation.update({
      where: { itemId_batchId_source: { itemId: params.itemId, batchId: params.batchId, source: params.source } },
      data: {
        heldQty: { decrement: params.qty },
        ...(alsoReserved ? { reservedQty: { decrement: params.qty } } : {}),
      },
    });
  }
}
