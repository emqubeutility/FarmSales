import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { CreateStockAdjustmentDto } from '@farm-sales/shared';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuditLogService } from '../common/audit-log.service.js';
import { StockService } from '../stock/stock.service.js';
import { PackUnitsService } from '../pack-units/pack-units.service.js';

@Injectable()
export class StockAdjustmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
    private readonly stock: StockService,
    private readonly packUnits: PackUnitsService,
  ) {}

  // There's no dedicated adjustment table (HANDOVER.md's data model doesn't have one) — an
  // adjustment is just a ledger entry with reason=ADJUST, grouped under a generated id so the
  // audit log and the ledger both point at the same thing.
  async create(dto: CreateStockAdjustmentDto, userId: string) {
    const adjustmentId = randomUUID();
    return this.prisma.$transaction(async (tx) => {
      const balance = await this.stock.adjust(tx, {
        itemId: dto.itemId,
        batchId: dto.batchId,
        qtyDelta: dto.qtyDelta,
        reason: 'ADJUST',
        refType: 'StockAdjustment',
        refId: adjustmentId,
      });
      await this.packUnits.syncDelta(tx, dto.itemId, dto.batchId, dto.qtyDelta, `Adjust:${adjustmentId}`);
      await this.auditLog.record(tx, {
        userId,
        entity: 'StockAdjustment',
        entityId: adjustmentId,
        action: 'create',
        after: { ...dto, balanceAfter: balance.qty },
      });
      return { id: adjustmentId, ...dto, balanceAfter: balance.qty };
    });
  }
}
