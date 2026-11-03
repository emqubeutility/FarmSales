import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { CreateStockCountDto, SetStockCountLinesDto } from '@farm-sales/shared';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuditLogService } from '../common/audit-log.service.js';
import { StockService } from '../stock/stock.service.js';
import { PackUnitsService } from '../pack-units/pack-units.service.js';

const include = { lines: { include: { item: true, batch: true } } } as const;

@Injectable()
export class StockCountsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
    private readonly stock: StockService,
    private readonly packUnits: PackUnitsService,
  ) {}

  list() {
    return this.prisma.stockCount.findMany({ orderBy: { ts: 'desc' }, include });
  }

  async findOne(id: string) {
    const count = await this.prisma.stockCount.findUnique({ where: { id }, include });
    if (!count) throw new NotFoundException(`Stock count ${id} not found`);
    return count;
  }

  /**
   * Opens a count and snapshots the current balance of every active batch for the chosen items.
   * countedQty starts equal to systemQty (not zero) — an untouched line should mean "not yet
   * counted", not "found nothing", so closing without touching a line is a no-op, not a shortage.
   */
  async create(dto: CreateStockCountDto, userId: string) {
    return this.prisma.$transaction(async (tx) => {
      const count = await tx.stockCount.create({ data: { status: 'OPEN' } });
      const balances = await tx.stockBalance.findMany({ where: { itemId: { in: dto.itemIds } } });

      const lines = [];
      for (const balance of balances) {
        const line = await tx.stockCountLine.create({
          data: { countId: count.id, itemId: balance.itemId, batchId: balance.batchId, countedQty: balance.qty, systemQty: balance.qty },
        });
        lines.push(line);
      }

      await this.auditLog.record(tx, {
        userId,
        entity: 'StockCount',
        entityId: count.id,
        action: 'open',
        after: { itemIds: dto.itemIds, lineCount: lines.length },
      });
      return { ...count, lines };
    });
  }

  async setLines(countId: string, dto: SetStockCountLinesDto, userId: string) {
    return this.prisma.$transaction(async (tx) => {
      const count = await tx.stockCount.findUnique({ where: { id: countId } });
      if (!count) throw new NotFoundException(`Stock count ${countId} not found`);
      if (count.status !== 'OPEN') throw new BadRequestException('Stock count is already closed');

      for (const line of dto.lines) {
        const result = await tx.stockCountLine.updateMany({
          where: { id: line.lineId, countId },
          data: { countedQty: line.countedQty },
        });
        if (result.count === 0) throw new NotFoundException(`Stock count line ${line.lineId} not found on count ${countId}`);
      }

      await this.auditLog.record(tx, { userId, entity: 'StockCount', entityId: countId, action: 'update_lines', after: dto });
      return tx.stockCountLine.findMany({ where: { countId }, include: { item: true, batch: true } });
    });
  }

  /** Closes the count, applying (countedQty - systemQty) as a COUNT movement for every line that varies. */
  async close(countId: string, userId: string) {
    return this.prisma.$transaction(async (tx) => {
      const count = await tx.stockCount.findUnique({ where: { id: countId }, include: { lines: true } });
      if (!count) throw new NotFoundException(`Stock count ${countId} not found`);
      if (count.status !== 'OPEN') throw new BadRequestException('Stock count is already closed');

      const variances = [];
      for (const line of count.lines) {
        // StockCountLine.batchId is nullable in the schema, but this service only ever creates
        // lines from StockBalance rows (which always have a batchId) — guard rather than assert.
        if (!line.batchId) continue;
        const delta = line.countedQty.sub(line.systemQty);
        if (!delta.isZero()) {
          await this.stock.adjust(tx, {
            itemId: line.itemId,
            batchId: line.batchId,
            qtyDelta: delta.toNumber(),
            reason: 'COUNT',
            refType: 'StockCount',
            refId: countId,
          });
          await this.packUnits.syncDelta(tx, line.itemId, line.batchId, delta.toNumber(), `Count:${countId}`);
          variances.push({ itemId: line.itemId, batchId: line.batchId, delta: delta.toNumber() });
        }
      }

      const closed = await tx.stockCount.update({ where: { id: countId }, data: { status: 'CLOSED' } });
      await this.auditLog.record(tx, { userId, entity: 'StockCount', entityId: countId, action: 'close', after: { variances } });
      return { ...closed, variances };
    });
  }
}
