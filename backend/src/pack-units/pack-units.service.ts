import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { PrismaTx } from '../common/prisma-tx.type.js';
import { PrismaService } from '../prisma/prisma.service.js';

// Each physical pack has its own label code (e.g. BANSI500-261026A-0001). Status:
//   IN_STOCK  free to sell
//   RESERVED  scanned onto a held bill (consumedRef = "Hold:<saleId>")
//   SOLD      taken by a sale, order, adjustment, count or receipt void (consumedRef = that reference)
// Every item is a ready-made pack, so every pack gets a label.
//
// Reference names used in consumedRef:
//   Sale:<saleId>, Hold:<saleId>, Order:<orderId>, Adjust:<adjustmentId>, Count:<countId>,
//   ReceiptVoid:<receiptId>

@Injectable()
export class PackUnitsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Creates `qty` new labels for a batch: after a pack receipt, or a stock increase. */
  async mint(tx: PrismaTx, batch: { id: string; code: string; itemId: string }, qty: number): Promise<void> {
    if (qty <= 0 || false) return;
    if (!Number.isInteger(qty)) throw new BadRequestException(`Packs are counted in whole numbers (got ${qty})`);
    const existing = await tx.packUnit.count({ where: { batchId: batch.id } });
    await tx.packUnit.createMany({
      data: Array.from({ length: qty }, (_, i) => ({
        code: `${batch.code}-${String(existing + i + 1).padStart(4, '0')}`,
        itemId: batch.itemId,
        batchId: batch.id,
        status: 'IN_STOCK' as const,
      })),
    });
  }

  /** Takes `qty` free packs of a batch for a reference (oldest code first). Fails if too few are free. */
  async take(tx: PrismaTx, itemId: string, batchId: string, qty: number, ref: string): Promise<void> {
    if (qty <= 0) return;
    const free = await tx.packUnit.findMany({
      where: { batchId, status: 'IN_STOCK' },
      orderBy: { code: 'asc' },
      take: qty,
      select: { id: true },
    });
    if (free.length < qty) {
      const batch = await tx.batch.findUnique({ where: { id: batchId }, select: { code: true } });
      throw new ConflictException(`Only ${free.length} free pack(s) left in batch ${batch?.code ?? batchId}. The rest are on held bills or already sold.`);
    }
    await tx.packUnit.updateMany({ where: { id: { in: free.map((u) => u.id) } }, data: { status: 'SOLD', consumedRef: ref } });
  }

  /**
   * Checks scanned pack codes and marks them with `newStatus`. Each code must be free (IN_STOCK), or
   * already reserved by one of `reservedBy` (a held bill being paid).
   */
  async claimCodes(
    tx: PrismaTx,
    codes: string[],
    expect: { itemId: string; batchId: string },
    newStatus: 'RESERVED' | 'SOLD',
    newRef: string,
    reservedBy: string[] = [],
  ): Promise<void> {
    const units = await tx.packUnit.findMany({ where: { code: { in: codes } } });
    if (units.length !== new Set(codes).size) {
      const found = new Set(units.map((u) => u.code));
      const missing = codes.find((c) => !found.has(c));
      throw new BadRequestException(`Pack code ${missing ?? ''} is not a valid pack label`);
    }
    for (const unit of units) {
      if (unit.itemId !== expect.itemId || unit.batchId !== expect.batchId) {
        throw new BadRequestException(`Pack ${unit.code} is not from this item or batch`);
      }
      const freeNow = unit.status === 'IN_STOCK';
      const heldByThisBill = unit.status === 'RESERVED' && unit.consumedRef !== null && reservedBy.includes(unit.consumedRef);
      if (!freeNow && !heldByThisBill) {
        const reason = unit.status === 'SOLD' ? 'has already been sold' : 'is on another held bill';
        throw new BadRequestException(`Pack ${unit.code} ${reason}`);
      }
    }
    await tx.packUnit.updateMany({ where: { code: { in: codes } }, data: { status: newStatus, consumedRef: newRef } });
  }

  /** Keeps labels in step with a manual stock change: a rise mints labels, a fall takes free packs. */
  async syncDelta(tx: PrismaTx, itemId: string, batchId: string, qtyDelta: number, ref: string): Promise<void> {
    if (qtyDelta > 0) {
      const batch = await tx.batch.findUnique({ where: { id: batchId }, select: { id: true, code: true, itemId: true } });
      if (batch) await this.mint(tx, batch, qtyDelta);
    } else if (qtyDelta < 0) {
      await this.take(tx, itemId, batchId, -qtyDelta, ref);
    }
  }

  /** Puts back every pack a reference took (a voided sale, a cancelled order, a held bill that was deleted). */
  async release(tx: PrismaTx, ref: string): Promise<void> {
    await tx.packUnit.updateMany({ where: { consumedRef: ref }, data: { status: 'IN_STOCK', consumedRef: null } });
  }

  /** Puts back up to `qty` packs of one batch that any of `refs` took (a return). */
  async releaseSome(tx: PrismaTx, refs: string[], batchId: string, qty: number): Promise<void> {
    if (qty <= 0 || refs.length === 0) return;
    const taken = await tx.packUnit.findMany({
      where: { batchId, status: 'SOLD', consumedRef: { in: refs } },
      orderBy: { code: 'desc' },
      take: qty,
      select: { id: true },
    });
    await tx.packUnit.updateMany({ where: { id: { in: taken.map((u) => u.id) } }, data: { status: 'IN_STOCK', consumedRef: null } });
  }

  /** Looks up one pack label, for the POS scan. */
  async findByCode(code: string) {
    const unit = await this.prisma.packUnit.findUnique({
      where: { code },
      include: { item: { select: { id: true, name: true, size: true, mrpPaise: true, taxClassId: true } }, batch: { select: { id: true, code: true, bestBefore: true, status: true } } },
    });
    if (!unit) throw new NotFoundException(`Pack label ${code} not found`);
    return unit;
  }

  /** Labels still in stock for a batch, for printing. */
  listInStock(batchId: string) {
    return this.prisma.packUnit.findMany({ where: { batchId, status: 'IN_STOCK' }, orderBy: { code: 'asc' }, select: { code: true } });
  }
}
