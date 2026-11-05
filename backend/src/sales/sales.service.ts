import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { Channel, Prisma, SalesPoint } from '@prisma/client';
import {
  calcBillTotals,
  DiscountExceedsMaxError,
  isExpired,
  type FinalizeSaleDto,
  type HoldSaleDto,
  type ResumeFinalizeSaleDto,
  type SalePaymentInput,
  type UpdateHeldSaleDto,
} from '@farm-sales/shared';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuditLogService } from '../common/audit-log.service.js';
import { StockService } from '../stock/stock.service.js';
import { DocumentSeriesService } from '../document-series/document-series.service.js';
import { TaxClassesService } from '../tax-classes/tax-classes.service.js';
import { PackUnitsService } from '../pack-units/pack-units.service.js';
import type { PrismaTx } from '../common/prisma-tx.type.js';

const include = {
  lines: { include: { item: true, batches: { include: { batch: true } } } },
  payments: true,
  // Only set for a bill created from a dispatched Order (docs/mock has no walk-in customer
  // capture) — the bill view uses this for the "Bill to" / delivery address section.
  order: { select: { customerName: true, customerPhone: true, deliveryAddress: true, zone: { select: { name: true } } } },
} as const;

interface PendingSaleLine {
  id: string;
  itemId: string;
  qty: Prisma.Decimal;
  mrpPaise: number;
  taxRatePct: Prisma.Decimal;
  batchId?: string;
  // Scanned pack codes for this line. unitsTaken means they were already marked as sold.
  unitCodes?: string[];
  unitsTaken?: boolean;
}

@Injectable()
export class SalesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
    private readonly stock: StockService,
    private readonly documentSeries: DocumentSeriesService,
    private readonly taxClasses: TaxClassesService,
    private readonly packUnits: PackUnitsService,
  ) {}

  list(limit = 200) {
    // Newest first, capped: the list used to load every bill ever made. ?limit= overrides (max 1000).
    return this.prisma.sale.findMany({ relationLoadStrategy: 'join', orderBy: { createdAt: 'desc' }, take: Math.min(Math.max(limit, 1), 1000), include });
  }

  listHeld() {
    return this.prisma.sale.findMany({ relationLoadStrategy: 'join', where: { status: 'HELD' }, orderBy: { createdAt: 'asc' }, include });
  }

  /** One query for all the items on a bill instead of one per line (each round trip is ~270 ms to Neon us-east-2). */
  private async loadItems(tx: PrismaTx, ids: string[]) {
    const items = await tx.item.findMany({ where: { id: { in: [...new Set(ids)] } } });
    return new Map(items.map((i) => [i.id, i]));
  }

  async findOne(id: string) {
    const sale = await this.prisma.sale.findUnique({ where: { id }, relationLoadStrategy: 'join', include });
    if (!sale) throw new NotFoundException(`Sale ${id} not found`);
    return sale;
  }

  /**
   * Saves the bill as a draft: no stock moves and no bill number yet. Scanned packs are reserved for
   * this bill, so no other bill can take them until it is paid or deleted.
   */
  async hold(dto: HoldSaleDto, userId: string) {
    return this.prisma.$transaction(async (tx) => {
      const sale = await tx.sale.create({
        data: { salesPoint: dto.salesPoint, channel: dto.channel, status: 'HELD', discountPct: dto.discountPct },
      });
      const itemsById = await this.loadItems(tx, dto.lines.map((l) => l.itemId));
      for (const line of dto.lines) {
        const item = itemsById.get(line.itemId);
        if (!item) throw new NotFoundException(`Item ${line.itemId} not found`);
        const taxRatePct = await this.taxClasses.effectiveRatePct(tx, item.taxClassId);
        await tx.saleLine.create({
          data: { saleId: sale.id, itemId: item.id, qty: line.qty, mrpPaise: item.mrpPaise ?? 0, taxRatePct, batchId: line.batchId ?? null },
        });
        if (line.unitCodes && line.batchId) {
          await this.packUnits.claimCodes(tx, line.unitCodes, { itemId: item.id, batchId: line.batchId }, 'RESERVED', `Hold:${sale.id}`);
        }
      }
      await this.auditLog.record(tx, { userId, entity: 'Sale', entityId: sale.id, action: 'hold', after: { lineCount: dto.lines.length } });
      return this.getFullSale(tx, sale.id);
    });
  }

  /** The common path: scan, bill, pay, done — all in one transaction. */
  async finalize(dto: FinalizeSaleDto, userId: string) {
    return this.prisma.$transaction(async (tx) => {
      const sale = await tx.sale.create({
        data: { salesPoint: dto.salesPoint, channel: dto.channel, status: 'HELD', discountPct: dto.discountPct },
      });
      const lines: PendingSaleLine[] = [];
      const itemsById = await this.loadItems(tx, dto.lines.map((l) => l.itemId));
      for (const line of dto.lines) {
        const item = itemsById.get(line.itemId);
        if (!item) throw new NotFoundException(`Item ${line.itemId} not found`);
        const taxRatePct = await this.taxClasses.effectiveRatePct(tx, item.taxClassId);
        const saleLine = await tx.saleLine.create({
          data: { saleId: sale.id, itemId: item.id, qty: line.qty, mrpPaise: item.mrpPaise ?? 0, taxRatePct, batchId: line.batchId ?? null },
        });
        lines.push({ ...saleLine, batchId: line.batchId, unitCodes: line.unitCodes });
      }
      return this.finalizeCore(tx, sale, lines, dto.payments, dto.customerPhone, userId);
    });
  }

  /**
   * Resumes a held bill. Its lines and price/tax snapshot are reused. The packs reserved for it when
   * it was held are the ones sold, so the cashier gets the same packs back.
   */
  async resumeFinalize(saleId: string, dto: ResumeFinalizeSaleDto, userId: string) {
    return this.prisma.$transaction(async (tx) => {
      const sale = await tx.sale.findUnique({ where: { id: saleId }, include: { lines: true } });
      if (!sale) throw new NotFoundException(`Sale ${saleId} not found`);
      if (sale.status !== 'HELD') throw new BadRequestException('Sale is not held');

      const reserved = await tx.packUnit.findMany({ where: { consumedRef: `Hold:${saleId}` }, select: { code: true, batchId: true }, orderBy: { code: 'asc' } });
      const codesByBatch = new Map<string, string[]>();
      for (const unit of reserved) {
        codesByBatch.set(unit.batchId, [...(codesByBatch.get(unit.batchId) ?? []), unit.code]);
      }
      const lines: PendingSaleLine[] = sale.lines.map((l) => {
        const codes = l.batchId ? codesByBatch.get(l.batchId) : undefined;
        return { ...l, batchId: l.batchId ?? undefined, unitCodes: codes };
      });
      return this.finalizeCore(tx, sale, lines, dto.payments, dto.customerPhone, userId);
    });
  }

  /** Replaces a held sale's lines/discount/channel wholesale. Packs reserved for it are released first. */
  async updateHeld(id: string, dto: UpdateHeldSaleDto, userId: string) {
    return this.prisma.$transaction(async (tx) => {
      const before = await tx.sale.findUnique({ where: { id }, include: { lines: true } });
      if (!before) throw new NotFoundException(`Sale ${id} not found`);
      if (before.status !== 'HELD') throw new BadRequestException('Only a held sale can be edited — a finalized sale must be voided instead');

      if (dto.lines) {
        await this.packUnits.release(tx, `Hold:${id}`);
        await tx.saleLine.deleteMany({ where: { saleId: id } });
        const itemsById = await this.loadItems(tx, dto.lines.map((l) => l.itemId));
        for (const line of dto.lines) {
          const item = itemsById.get(line.itemId);
          if (!item) throw new NotFoundException(`Item ${line.itemId} not found`);
          const taxRatePct = await this.taxClasses.effectiveRatePct(tx, item.taxClassId);
          await tx.saleLine.create({ data: { saleId: id, itemId: item.id, qty: line.qty, mrpPaise: item.mrpPaise ?? 0, taxRatePct, batchId: line.batchId ?? null } });
          if (line.unitCodes && line.batchId) {
            await this.packUnits.claimCodes(tx, line.unitCodes, { itemId: item.id, batchId: line.batchId }, 'RESERVED', `Hold:${id}`);
          }
        }
      }

      const after = await tx.sale.update({
        where: { id },
        data: { salesPoint: dto.salesPoint, channel: dto.channel, discountPct: dto.discountPct },
      });
      await this.auditLog.record(tx, { userId, entity: 'Sale', entityId: id, action: 'update', before, after });
      return this.getFullSale(tx, id);
    });
  }

  /** Deletes a held bill and releases the packs reserved for it. A finalized sale cannot be deleted; void it instead. */
  async deleteHeld(id: string, userId: string) {
    return this.prisma.$transaction(async (tx) => {
      const sale = await tx.sale.findUnique({ where: { id } });
      if (!sale) throw new NotFoundException(`Sale ${id} not found`);
      if (sale.status !== 'HELD') throw new BadRequestException('Only a held sale can be deleted — a finalized sale must be voided instead');

      await this.packUnits.release(tx, `Hold:${id}`);
      await this.auditLog.record(tx, { userId, entity: 'Sale', entityId: id, action: 'delete', before: sale });
      await tx.saleLine.deleteMany({ where: { saleId: id } });
      await tx.sale.delete({ where: { id } });
      return { id, deleted: true };
    });
  }

  /**
   * Cancels a finalized sale: reverses every batch it decremented (reason RETURN, so it reads
   * clearly in the ledger) and marks it VOID. The row, its number and its ledger history all stay
   * — per HANDOVER.md's append-only non-negotiable and because a real bill number is never
   * reused once allocated. The packs it sold go back on the shelf.
   */
  async void(id: string, userId: string) {
    return this.prisma.$transaction(async (tx) => {
      const sale = await tx.sale.findUnique({
        where: { id },
        include: { lines: { include: { batches: { include: { batch: true } } } } },
      });
      if (!sale) throw new NotFoundException(`Sale ${id} not found`);
      if (sale.status !== 'FINALIZED') throw new BadRequestException('Only a finalized sale can be voided');

      for (const line of sale.lines) {
        for (const saleLineBatch of line.batches) {
          await this.stock.adjust(tx, {
            itemId: saleLineBatch.batch.itemId,
            batchId: saleLineBatch.batchId,
            qtyDelta: saleLineBatch.qty.toNumber(),
            reason: 'RETURN',
            refType: 'SaleVoid',
            refId: id,
          });
        }
      }
      await this.packUnits.release(tx, `Sale:${id}`);

      await tx.sale.update({ where: { id }, data: { status: 'VOID', voidedAt: new Date() } });
      await this.auditLog.record(tx, { userId, entity: 'Sale', entityId: id, action: 'void' });
      return this.getFullSale(tx, id);
    });
  }

  private async finalizeCore(
    tx: PrismaTx,
    sale: { id: string; channel: Channel; salesPoint: SalesPoint; discountPct: Prisma.Decimal },
    lines: PendingSaleLine[],
    payments: SalePaymentInput[],
    customerPhone: string,
    userId: string,
  ) {
    for (const payment of payments) {
      if (payment.mode === 'B2B_CREDIT') {
        throw new BadRequestException(`Payment mode ${payment.mode} is not yet supported`);
      }
      if (payment.mode === 'CREDIT_NOTE' && !payment.creditNoteId) {
        throw new BadRequestException('creditNoteId is required for a CREDIT_NOTE payment');
      }
    }

    const channelDiscount = await tx.channelDiscount.findUnique({ where: { channel: sale.channel } });
    if (!channelDiscount) throw new NotFoundException(`No discount configured for channel ${sale.channel}`);

    const billLines = lines.map((l) => ({ mrpPaise: l.mrpPaise, qty: l.qty.toNumber(), taxRatePct: l.taxRatePct.toNumber() }));
    let totals;
    try {
      totals = calcBillTotals(billLines, sale.discountPct.toNumber(), channelDiscount.maxPct.toNumber());
    } catch (err) {
      if (err instanceof DiscountExceedsMaxError) throw new BadRequestException(err.message);
      throw err;
    }

    const paidPaise = payments.reduce((sum, p) => sum + p.amountPaise, 0);
    if (paidPaise !== totals.totalPaise) {
      throw new BadRequestException(`Payments total ${paidPaise} paise does not match bill total ${totals.totalPaise} paise`);
    }

    // Scanned packs are sold now. Each code must still be free, or reserved for this bill.
    for (const line of lines) {
      if (line.unitCodes && line.unitCodes.length > 0 && line.batchId) {
        await this.packUnits.claimCodes(
          tx,
          line.unitCodes,
          { itemId: line.itemId, batchId: line.batchId },
          'SOLD',
          `Sale:${sale.id}`,
          [`Hold:${sale.id}`],
        );
        line.unitsTaken = true;
      }
    }

    for (const line of lines) {
      await this.allocateAndDecrementLine(tx, sale.id, line);
    }

    for (const payment of payments) {
      if (payment.mode === 'CREDIT_NOTE') {
        await this.redeemCreditNote(tx, payment.creditNoteId!, payment.amountPaise);
      }
      await tx.payment.create({
        data: { saleId: sale.id, mode: payment.mode, amountPaise: payment.amountPaise, reference: payment.reference, creditNoteId: payment.creditNoteId },
      });
    }

    const prefix = sale.salesPoint === 'MARKET_STALL' ? 'MK-' : 'WH-';
    const number = await this.documentSeries.allocateNext(prefix, tx);

    await tx.sale.update({
      where: { id: sale.id },
      data: {
        number,
        customerPhone,
        status: 'FINALIZED',
        grossPaise: totals.grossPaise,
        discountPaise: totals.discountPaise,
        netPaise: totals.netPaise,
        taxablePaise: totals.taxablePaise,
        taxPaise: totals.taxPaise,
        roundOffPaise: totals.roundOffPaise,
        totalPaise: totals.totalPaise,
        finalizedAt: new Date(),
      },
    });

    await this.auditLog.record(tx, { userId, entity: 'Sale', entityId: sale.id, action: 'finalize', after: { number, totals } });

    return this.getFullSale(tx, sale.id);
  }

  private async allocateAndDecrementLine(tx: PrismaTx, saleId: string, line: PendingSaleLine) {
    const item = await tx.item.findUnique({ where: { id: line.itemId } });
    if (!item) throw new NotFoundException(`Item ${line.itemId} not found`);

    if (line.batchId) {
      // A batch picked exactly (scanned packs). Check it belongs to this item, is not on hold or
      // expired, and has enough stock, so the bill can't take another item's stock or a held lot.
      const batch = await tx.batch.findUnique({ where: { id: line.batchId }, include: { stockBalances: true } });
      if (!batch || batch.itemId !== item.id) {
        throw new BadRequestException('Scanned batch does not belong to this item');
      }
      if (batch.status !== 'ACTIVE') {
        throw new BadRequestException(`Batch ${batch.code} is on hold and cannot be sold`);
      }
      if (isExpired(batch.bestBefore)) {
        throw new BadRequestException(`EXPIRED: batch ${batch.code} expired on ${batch.bestBefore!.toISOString().slice(0, 10)} and cannot be sold`);
      }
      const available = batch.stockBalances.find((b) => b.itemId === item.id)?.qty.toNumber() ?? 0;
      if (available < line.qty.toNumber()) {
        throw new BadRequestException(`Only ${available} left in batch ${batch.code}`);
      }
      await tx.saleLineBatch.create({ data: { saleLineId: line.id, batchId: line.batchId, qty: line.qty } });
      await this.stock.adjust(tx, {
        itemId: item.id,
        batchId: line.batchId,
        qtyDelta: -line.qty.toNumber(),
        reason: 'SALE',
        refType: 'Sale',
        refId: saleId,
      });
      if (!line.unitsTaken) {
        await this.packUnits.take(tx, item.id, line.batchId, line.qty.toNumber(), `Sale:${saleId}`);
      }
      return;
    }

    const allocations = await this.stock.decrementFefo(tx, { itemId: item.id, qty: line.qty.toNumber(), reason: 'SALE', refType: 'Sale', refId: saleId });
    for (const allocation of allocations) {
      await tx.saleLineBatch.create({ data: { saleLineId: line.id, batchId: allocation.batchId, qty: allocation.qty } });
      await this.packUnits.take(tx, item.id, allocation.batchId, allocation.qty, `Sale:${saleId}`);
    }
  }

  private getFullSale(tx: PrismaTx, id: string) {
    return tx.sale.findUnique({ where: { id }, relationLoadStrategy: 'join', include });
  }

  /**
   * A credit note is redeemable by whoever presents its number — no customer match required
   * (HANDOVER.md section 2: "credit notes never expire"). Just checks it exists and has enough
   * balance left, then decrements it.
   */
  private async redeemCreditNote(tx: PrismaTx, creditNoteId: string, amountPaise: number) {
    const note = await tx.creditNote.findUnique({ where: { id: creditNoteId } });
    if (!note) throw new NotFoundException(`Credit note ${creditNoteId} not found`);
    if (note.balancePaise < amountPaise) {
      throw new BadRequestException(`Credit note ${note.number} has only ${note.balancePaise} paise left, cannot redeem ${amountPaise}`);
    }
    await tx.creditNote.update({ where: { id: creditNoteId }, data: { balancePaise: { decrement: amountPaise } } });
  }
}
