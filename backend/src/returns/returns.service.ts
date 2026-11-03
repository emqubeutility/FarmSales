import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { CreateReturnDto } from '@farm-sales/shared';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuditLogService } from '../common/audit-log.service.js';
import { StockService } from '../stock/stock.service.js';
import { DocumentSeriesService } from '../document-series/document-series.service.js';
import { PackUnitsService } from '../pack-units/pack-units.service.js';

const include = {
  sale: true,
  creditNote: true,
  lines: { include: { saleLineBatch: { include: { batch: true, saleLine: { include: { item: true } } } } } },
} as const;

interface ValidatedReturnLine {
  saleLineBatchId: string;
  itemId: string;
  batchId: string;
  qty: number;
  mrpPaise: number;
  restock: boolean;
}

@Injectable()
export class ReturnsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
    private readonly stock: StockService,
    private readonly documentSeries: DocumentSeriesService,
    private readonly packUnits: PackUnitsService,
  ) {}

  list() {
    return this.prisma.return.findMany({ orderBy: { createdAt: 'desc' }, include });
  }

  async findOne(id: string) {
    const ret = await this.prisma.return.findUnique({ where: { id }, include });
    if (!ret) throw new NotFoundException(`Return ${id} not found`);
    return ret;
  }

  async create(dto: CreateReturnDto, userId: string) {
    if (dto.disposition === 'REFUND' && !dto.refundMode) {
      throw new BadRequestException('refundMode is required when disposition is REFUND');
    }

    return this.prisma.$transaction(async (tx) => {
      const sale = await tx.sale.findUnique({ where: { id: dto.saleId } });
      if (!sale) throw new NotFoundException(`Sale ${dto.saleId} not found`);
      if (sale.status !== 'FINALIZED' || sale.totalPaise === null || sale.grossPaise === null) {
        throw new BadRequestException('Can only return against a finalized sale');
      }

      // What fraction of each MRP-rupee was actually collected after discount/tax/round-off —
      // applied to the returned lines so the refund/credit matches what was actually paid, not
      // the raw MRP.
      const payoutRatio = sale.totalPaise / sale.grossPaise;

      const validated: ValidatedReturnLine[] = [];
      let totalPaise = 0;

      for (const line of dto.lines) {
        const saleLineBatch = await tx.saleLineBatch.findUnique({
          where: { id: line.saleLineBatchId },
          include: { saleLine: true, batch: true },
        });
        if (!saleLineBatch) throw new NotFoundException(`Sale line batch ${line.saleLineBatchId} not found`);
        if (saleLineBatch.saleLine.saleId !== dto.saleId) {
          throw new BadRequestException(`Sale line batch ${line.saleLineBatchId} does not belong to sale ${dto.saleId}`);
        }

        const alreadyReturned = await tx.returnLine.aggregate({
          where: { saleLineBatchId: line.saleLineBatchId },
          _sum: { qty: true },
        });
        const returnable = saleLineBatch.qty.toNumber() - (alreadyReturned._sum.qty?.toNumber() ?? 0);
        if (line.qty > returnable) {
          throw new BadRequestException(`Only ${returnable} is returnable for sale line batch ${line.saleLineBatchId}`);
        }

        const mrpPaise = saleLineBatch.saleLine.mrpPaise;
        totalPaise += Math.round(line.qty * mrpPaise * payoutRatio);
        validated.push({
          saleLineBatchId: line.saleLineBatchId,
          itemId: saleLineBatch.batch.itemId,
          batchId: saleLineBatch.batchId,
          qty: line.qty,
          mrpPaise,
          restock: line.restock,
        });
      }

      const ret = await tx.return.create({
        data: {
          saleId: dto.saleId,
          disposition: dto.disposition,
          refundMode: dto.disposition === 'REFUND' ? dto.refundMode : undefined,
          reason: dto.reason,
          totalPaise,
        },
      });

      const linkedOrder = await tx.order.findFirst({ where: { saleId: dto.saleId }, select: { id: true } });
      const packRefs = [`Sale:${dto.saleId}`, ...(linkedOrder ? [`Order:${linkedOrder.id}`] : [])];

      for (const line of validated) {
        await tx.returnLine.create({
          data: { returnId: ret.id, saleLineBatchId: line.saleLineBatchId, qty: line.qty, mrpPaise: line.mrpPaise, restock: line.restock },
        });
        if (line.restock) {
          // Restocks the SAME batch it was sold from (HANDOVER.md section 4).
          await this.stock.adjust(tx, {
            itemId: line.itemId,
            batchId: line.batchId,
            qtyDelta: line.qty,
            reason: 'RETURN',
            refType: 'Return',
            refId: ret.id,
          });
          // The returned packs go back on the shelf under their own labels. A bill made from an
          // order took its packs under the order's reference, so both references are checked.
          await this.packUnits.releaseSome(tx, packRefs, line.batchId, line.qty);
        }
        // restock=false (write-off): refunded/credited the same way, but no stock movement —
        // the goods are gone (e.g. damaged), not back in sellable inventory.
      }

      let creditNoteNumber: string | undefined;
      if (dto.disposition === 'CREDIT_NOTE') {
        const number = await this.documentSeries.allocateNext('CN-', tx);
        const creditNote = await tx.creditNote.create({
          data: { number, customerId: dto.customerId, amountPaise: totalPaise, balancePaise: totalPaise },
        });
        await tx.return.update({ where: { id: ret.id }, data: { creditNoteId: creditNote.id } });
        creditNoteNumber = creditNote.number;
      }

      await this.auditLog.record(tx, {
        userId,
        entity: 'Return',
        entityId: ret.id,
        action: 'create',
        after: { disposition: dto.disposition, totalPaise, creditNoteNumber },
      });

      return tx.return.findUnique({ where: { id: ret.id }, include });
    });
  }
}
