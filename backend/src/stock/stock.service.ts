import { ConflictException, Injectable } from '@nestjs/common';
import { Prisma, type LedgerReason } from '@prisma/client';
import { allocateFefo, InsufficientStockError, isExpired, type FefoAllocation } from '@farm-sales/shared';
import type { PrismaTx } from '../common/prisma-tx.type.js';

export interface RecordMovementParams {
  itemId: string;
  batchId: string;
  qtyDelta: number;
  reason: LedgerReason;
  refType: string;
  refId: string;
  unitCostPaise?: number;
}

export interface ReceiveStockParams {
  itemId: string;
  batchId: string;
  qty: number;
  unitCostPaise: number;
  refType: string;
  refId: string;
}

export interface ReverseReceiptParams {
  itemId: string;
  batchId: string;
  qty: number;
  unitCostPaise: number;
  refType: string;
  refId: string;
}

export interface DecrementFefoParams {
  itemId: string;
  qty: number;
  reason: LedgerReason;
  refType: string;
  refId: string;
}

export interface AdjustParams {
  itemId: string;
  batchId: string;
  qtyDelta: number;
  reason: LedgerReason;
  refType: string;
  refId: string;
}

/**
 * The stock ledger/balance/cost engine. Every stock movement (receipts, FEFO sale decrements,
 * adjustments, counts) goes through this, so the ledger stays append-only and StockBalance never
 * drifts from it (HANDOVER.md section 5 non-negotiables). All methods take the caller's
 * transaction client — callers own the transaction boundary because a stock movement always
 * commits alongside the record that caused it (a goods receipt, a sale, ...), never alone.
 */
@Injectable()
export class StockService {
  async recordMovement(tx: PrismaTx, params: RecordMovementParams) {
    await tx.stockLedger.create({
      data: {
        itemId: params.itemId,
        batchId: params.batchId,
        qtyDelta: params.qtyDelta,
        reason: params.reason,
        refType: params.refType,
        refId: params.refId,
        unitCostPaise: params.unitCostPaise,
      },
    });

    const balance = await tx.stockBalance.upsert({
      where: { itemId_batchId: { itemId: params.itemId, batchId: params.batchId } },
      create: { itemId: params.itemId, batchId: params.batchId, qty: params.qtyDelta },
      update: { qty: { increment: params.qtyDelta } },
    });

    // The FEFO allocator (or the caller, for a manual adjustment) already decided this is safe
    // against the balance it read earlier in this transaction; if it's negative now, something
    // else changed the balance concurrently — abort and let the caller retry.
    if (balance.qty.lessThan(0)) {
      throw new ConflictException(`Stock balance for item ${params.itemId}, batch ${params.batchId} would go negative`);
    }

    // ItemCost.qtyOnHand mirrors sum(StockBalance) for every movement, not just receipts, so
    // reports/dashboards can read it directly instead of re-aggregating StockBalance every time.
    // avgCostPaise only ever changes in receiveStock (cost only moves on a cost-adding event).
    await tx.itemCost.upsert({
      where: { itemId: params.itemId },
      create: { itemId: params.itemId, avgCostPaise: 0, qtyOnHand: params.qtyDelta },
      update: { qtyOnHand: { increment: params.qtyDelta } },
    });

    return balance;
  }

  async receiveStock(tx: PrismaTx, params: ReceiveStockParams) {
    const existing = await tx.itemCost.findUnique({ where: { itemId: params.itemId } });
    const oldQty = existing?.qtyOnHand ?? new Prisma.Decimal(0);
    const oldAvgCostPaise = existing?.avgCostPaise ?? 0;

    await this.recordMovement(tx, {
      itemId: params.itemId,
      batchId: params.batchId,
      qtyDelta: params.qty,
      reason: 'RECEIPT',
      refType: params.refType,
      refId: params.refId,
      unitCostPaise: params.unitCostPaise,
    });

    const newQty = oldQty.add(params.qty);
    const newAvgCostPaise = newQty.isZero()
      ? 0
      : Math.round((oldAvgCostPaise * oldQty.toNumber() + params.unitCostPaise * params.qty) / newQty.toNumber());

    return tx.itemCost.update({ where: { itemId: params.itemId }, data: { avgCostPaise: newAvgCostPaise } });
  }

  /**
   * The exact algebraic inverse of receiveStock — voiding a goods-receipt line. Valid ONLY when
   * nothing else has moved this item's cost since that receipt (the caller must verify this,
   * e.g. GoodsReceiptsService checks no later StockLedger entries exist for the item); a weighted
   * average can't be un-weighted once something else has blended into it.
   */
  async reverseReceipt(tx: PrismaTx, params: ReverseReceiptParams) {
    const existing = await tx.itemCost.findUnique({ where: { itemId: params.itemId } });
    const oldQty = existing?.qtyOnHand ?? new Prisma.Decimal(0);
    const oldAvgCostPaise = existing?.avgCostPaise ?? 0;

    await this.recordMovement(tx, {
      itemId: params.itemId,
      batchId: params.batchId,
      qtyDelta: -params.qty,
      reason: 'ADJUST',
      refType: params.refType,
      refId: params.refId,
    });

    const newQty = oldQty.sub(params.qty);
    const newAvgCostPaise = newQty.isZero()
      ? 0
      : Math.round((oldAvgCostPaise * oldQty.toNumber() - params.unitCostPaise * params.qty) / newQty.toNumber());

    return tx.itemCost.update({ where: { itemId: params.itemId }, data: { avgCostPaise: newAvgCostPaise } });
  }

  async getFefoCandidates(tx: PrismaTx, itemId: string) {
    const balances = await tx.stockBalance.findMany({
      where: { itemId, qty: { gt: 0 } },
      include: { batch: true },
    });
    // Expired stock is never allocated to a sale or an order. The stock stays on
    // record and can be seen on Batches. It is only removed by a stock adjustment or a void.
    return balances
      .filter((b) => b.batch.status === 'ACTIVE' && !isExpired(b.batch.bestBefore))
      .map((b) => ({
        batchId: b.batchId,
        qty: b.qty.toNumber(),
        // Non-expiry items (packaging, materials) have no bestBefore; fall back to receivedOn so
        // they still get a stable FIFO order instead of breaking the allocator's Date requirement.
        bestBefore: b.batch.bestBefore ?? b.batch.receivedOn ?? new Date(0),
      }));
  }

  async decrementFefo(tx: PrismaTx, params: DecrementFefoParams): Promise<FefoAllocation[]> {
    const candidates = await this.getFefoCandidates(tx, params.itemId);
    let allocations: FefoAllocation[];
    try {
      allocations = allocateFefo(candidates, params.qty);
    } catch (err) {
      if (err instanceof InsufficientStockError) {
        throw new ConflictException(err.message);
      }
      throw err;
    }

    for (const allocation of allocations) {
      await this.recordMovement(tx, {
        itemId: params.itemId,
        batchId: allocation.batchId,
        qtyDelta: -allocation.qty,
        reason: params.reason,
        refType: params.refType,
        refId: params.refId,
      });
    }
    return allocations;
  }

  adjust(tx: PrismaTx, params: AdjustParams) {
    return this.recordMovement(tx, {
      itemId: params.itemId,
      batchId: params.batchId,
      qtyDelta: params.qtyDelta,
      reason: params.reason,
      refType: params.refType,
      refId: params.refId,
    });
  }
}
