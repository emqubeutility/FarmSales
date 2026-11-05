import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { CreateGoodsReceiptDto, UpdateGoodsReceiptDto } from '@farm-sales/shared';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuditLogService } from '../common/audit-log.service.js';
import { StockService } from '../stock/stock.service.js';
import { BatchesService } from '../batches/batches.service.js';
import { PackUnitsService } from '../pack-units/pack-units.service.js';
import type { PrismaTx } from '../common/prisma-tx.type.js';

const include = { supplier: true, lines: { include: { item: true, batch: true } } } as const;

@Injectable()
export class GoodsReceiptsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
    private readonly stock: StockService,
    private readonly batches: BatchesService,
    private readonly packUnits: PackUnitsService,
  ) {}

  list() {
    return this.prisma.goodsReceipt.findMany({ relationLoadStrategy: 'join', orderBy: { billDate: 'desc' }, include });
  }

  async findOne(id: string) {
    const receipt = await this.prisma.goodsReceipt.findUnique({ where: { id }, relationLoadStrategy: 'join', include });
    if (!receipt) throw new NotFoundException(`Goods receipt ${id} not found`);
    return receipt;
  }

  async create(dto: CreateGoodsReceiptDto, userId: string) {
    return this.prisma.$transaction(async (tx) => {
      const receipt = await tx.goodsReceipt.create({
        data: {
          supplierId: dto.supplierId,
          supplierBillNo: dto.supplierBillNo,
          billDate: dto.billDate,
          paymentMode: dto.paymentMode,
        },
      });

      let taxableValuePaise = 0;
      let inputGstPaise = 0;
      const lines = [];

      for (const line of dto.lines) {
        const item = await tx.item.findUnique({ where: { id: line.itemId } });
        if (!item) throw new NotFoundException(`Item ${line.itemId} not found`);

        // Every receipt gets a batch regardless of item.trackBatches — see BatchesService.
        const code = await this.batches.generateNextCode(tx, item.code, dto.billDate);
        const batch = await tx.batch.create({
          data: {
            itemId: item.id,
            code,
            supplierId: dto.supplierId,
            supplierLot: line.supplierLot,
            receivedOn: dto.billDate,
            mfgDate: line.mfgDate,
            bestBefore: line.bestBefore,
            status: 'ACTIVE',
          },
        });

        // ratePaise is ex-GST (the weighted-average cost basis); amountPaise is the GST-inclusive
        // line total shown on the supplier bill, matching docs/mock/receive-stock.html.
        const lineTaxablePaise = Math.round(line.qtyBase * line.ratePaise);
        const lineTaxPaise = Math.round((lineTaxablePaise * line.taxRatePct) / 100);
        const amountPaise = lineTaxablePaise + lineTaxPaise;
        taxableValuePaise += lineTaxablePaise;
        inputGstPaise += lineTaxPaise;

        const receiptLine = await tx.goodsReceiptLine.create({
          data: {
            receiptId: receipt.id,
            itemId: item.id,
            receivedAs: line.receivedAs,
            qtyBase: line.qtyBase,
            ratePaise: line.ratePaise,
            taxRateSnapshot: line.taxRatePct,
            amountPaise,
            batchId: batch.id,
          },
        });

        const itemCost = await this.stock.receiveStock(tx, {
          itemId: item.id,
          batchId: batch.id,
          qty: line.qtyBase,
          unitCostPaise: line.ratePaise,
          refType: 'GoodsReceipt',
          refId: receipt.id,
        });
        // Bought-in finished packs get their own labels too.
        await this.packUnits.mint(tx, batch, line.qtyBase);

        lines.push({ ...receiptLine, batch, avgCostPaiseAfter: itemCost.avgCostPaise });
      }

      await this.auditLog.record(tx, {
        userId,
        entity: 'GoodsReceipt',
        entityId: receipt.id,
        action: 'create',
        after: { receipt, lineCount: lines.length },
      });

      return {
        ...receipt,
        lines,
        summary: { taxableValuePaise, inputGstPaise, billTotalPaise: taxableValuePaise + inputGstPaise },
      };
    });
  }

  /**
   * A weighted average can't be un-weighted once something else has blended into it. This checks
   * that nothing — another receipt, a sale, an order, an adjustment or count — has moved `itemId`
   * since this receipt did, i.e. this receipt is still the most recent cost-affecting event for
   * it. Required before reverseReceipt (used by both update and void).
   */
  private async assertIsLatestCostEvent(tx: PrismaTx, itemId: string, receiptId: string) {
    const ownEntries = await tx.stockLedger.findMany({
      where: { itemId, refType: 'GoodsReceipt', refId: receiptId },
      orderBy: { ts: 'desc' },
      take: 1,
    });
    const ownLatestTs = ownEntries[0]?.ts ?? new Date(0);
    const laterCount = await tx.stockLedger.count({ where: { itemId, ts: { gt: ownLatestTs } } });
    if (laterCount > 0) {
      throw new ConflictException(
        `Cannot edit or void this receipt: stock for one of its items has moved since it was recorded. Use a stock adjustment instead.`,
      );
    }
  }

  async update(id: string, dto: UpdateGoodsReceiptDto, userId: string) {
    return this.prisma.$transaction(async (tx) => {
      const receipt = await tx.goodsReceipt.findUnique({ where: { id }, include: { lines: true } });
      if (!receipt) throw new NotFoundException(`Goods receipt ${id} not found`);
      if (receipt.status === 'VOID') throw new BadRequestException('Cannot edit a voided receipt');

      const affectedItemIds = [...new Set(receipt.lines.map((l) => l.itemId))];
      for (const itemId of affectedItemIds) {
        await this.assertIsLatestCostEvent(tx, itemId, id);
      }

      let taxableValuePaise = 0;
      let inputGstPaise = 0;

      for (const line of receipt.lines) {
        const patch = dto.lines?.find((p) => p.lineId === line.id);
        if (!patch) continue;

        const newQty = patch.qtyBase ?? line.qtyBase.toNumber();
        const newRate = patch.ratePaise ?? line.ratePaise;
        const newTaxPct = patch.taxRatePct ?? line.taxRateSnapshot.toNumber();

        // Reverse this line's old contribution, then reapply with the corrected values — exact
        // because we just confirmed this receipt is still the item's most recent cost event.
        await this.stock.reverseReceipt(tx, {
          itemId: line.itemId,
          batchId: line.batchId!,
          qty: line.qtyBase.toNumber(),
          unitCostPaise: line.ratePaise,
          refType: 'GoodsReceiptEdit',
          refId: id,
        });
        await this.stock.receiveStock(tx, {
          itemId: line.itemId,
          batchId: line.batchId!,
          qty: newQty,
          unitCostPaise: newRate,
          refType: 'GoodsReceiptEdit',
          refId: id,
        });

        const lineTaxablePaise = Math.round(newQty * newRate);
        const lineTaxPaise = Math.round((lineTaxablePaise * newTaxPct) / 100);
        taxableValuePaise += lineTaxablePaise;
        inputGstPaise += lineTaxPaise;

        await tx.goodsReceiptLine.update({
          where: { id: line.id },
          data: {
            qtyBase: newQty,
            ratePaise: newRate,
            taxRateSnapshot: newTaxPct,
            amountPaise: lineTaxablePaise + lineTaxPaise,
            receivedAs: patch.receivedAs ?? line.receivedAs,
          },
        });

        if (patch.supplierLot !== undefined || patch.bestBefore !== undefined) {
          await tx.batch.update({
            where: { id: line.batchId! },
            data: { supplierLot: patch.supplierLot, bestBefore: patch.bestBefore },
          });
        }
      }

      const before = receipt;
      const after = await tx.goodsReceipt.update({
        where: { id },
        data: { supplierBillNo: dto.supplierBillNo, billDate: dto.billDate, paymentMode: dto.paymentMode },
      });
      await this.auditLog.record(tx, { userId, entity: 'GoodsReceipt', entityId: id, action: 'update', before, after });

      return tx.goodsReceipt.findUnique({ where: { id }, include });
    });
  }

  async void(id: string, userId: string) {
    return this.prisma.$transaction(async (tx) => {
      const receipt = await tx.goodsReceipt.findUnique({ where: { id }, include: { lines: true } });
      if (!receipt) throw new NotFoundException(`Goods receipt ${id} not found`);
      if (receipt.status === 'VOID') throw new BadRequestException('This receipt is already voided');

      const affectedItemIds = [...new Set(receipt.lines.map((l) => l.itemId))];
      for (const itemId of affectedItemIds) {
        await this.assertIsLatestCostEvent(tx, itemId, id);
      }

      for (const line of receipt.lines) {
        await this.stock.reverseReceipt(tx, {
          itemId: line.itemId,
          batchId: line.batchId!,
          qty: line.qtyBase.toNumber(),
          unitCostPaise: line.ratePaise,
          refType: 'GoodsReceiptVoid',
          refId: id,
        });
        // The packs this receipt added leave the shelf with it. Packs already sold block the void.
        await this.packUnits.take(tx, line.itemId, line.batchId!, line.qtyBase.toNumber(), `ReceiptVoid:${id}`);
        // Belt-and-suspenders: qty is already 0 so FEFO would skip it anyway, but HOLD makes a
        // voided batch unmistakable if anyone looks at Batches directly.
        await tx.batch.update({ where: { id: line.batchId! }, data: { status: 'HOLD' } });
      }

      await tx.goodsReceipt.update({ where: { id }, data: { status: 'VOID', voidedAt: new Date() } });
      await this.auditLog.record(tx, { userId, entity: 'GoodsReceipt', entityId: id, action: 'void' });

      return tx.goodsReceipt.findUnique({ where: { id }, include });
    });
  }
}
