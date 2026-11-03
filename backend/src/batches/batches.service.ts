import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { UpdateBatchDto } from '@farm-sales/shared';
import type { PrismaTx } from '../common/prisma-tx.type.js';
import { AuditLogService } from '../common/audit-log.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

function formatYyMmDd(date: Date): string {
  const yy = String(date.getUTCFullYear() % 100).padStart(2, '0');
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(date.getUTCDate()).padStart(2, '0');
  return `${yy}${mm}${dd}`;
}

@Injectable()
export class BatchesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
  ) {}

  /**
   * Corrects a batch's best-before date. The old and new dates are written to the audit log in the
   * same transaction, so every change can be traced to the user who made it.
   */
  async updateBestBefore(id: string, dto: UpdateBatchDto, userId: string) {
    return this.prisma.$transaction(async (tx) => {
      const before = await tx.batch.findUnique({ where: { id } });
      if (!before) throw new NotFoundException(`Batch ${id} not found`);
      const after = await tx.batch.update({ where: { id }, data: { bestBefore: dto.bestBefore } });
      await this.auditLog.record(tx, {
        userId,
        entity: 'Batch',
        entityId: id,
        action: 'update_best_before',
        before: { code: before.code, bestBefore: before.bestBefore },
        after: { code: after.code, bestBefore: after.bestBefore },
      });
      return after;
    });
  }

  /**
   * Next batch code for `itemCode` on `date`: ITEMCODE-YYMMDD + the next unused letter for that
   * item/day (RAGI-261006A, then RAGI-261006B, ...), per HANDOVER.md section 2. Every receipt
   * gets a batch this way regardless of the item's trackBatches switch — that flag controls what
   * the UI asks for and prints, not whether the internal ledger has a batch to point at.
   */
  async generateNextCode(tx: PrismaTx, itemCode: string, date: Date): Promise<string> {
    const prefix = `${itemCode}-${formatYyMmDd(date)}`;
    const existing = await tx.batch.findMany({
      where: { code: { startsWith: prefix } },
      select: { code: true },
    });
    const usedLetters = new Set(existing.map((b) => b.code.slice(prefix.length)));
    for (let i = 0; i < 26; i++) {
      const letter = String.fromCharCode(65 + i);
      if (!usedLetters.has(letter)) return `${prefix}${letter}`;
    }
    throw new Error(`More than 26 batches for ${prefix} in one day — batch code scheme exhausted`);
  }

  list(query: { itemId?: string; search?: string }) {
    const where: Prisma.BatchWhereInput = {
      itemId: query.itemId,
      ...(query.search && {
        OR: [{ code: { contains: query.search, mode: 'insensitive' } }, { item: { name: { contains: query.search, mode: 'insensitive' } } }],
      }),
    };
    return this.prisma.batch.findMany({
      where,
      orderBy: { code: 'asc' },
      include: { item: true, supplier: true, stockBalances: true },
    });
  }

  async findOne(id: string) {
    const batch = await this.prisma.batch.findUnique({
      where: { id },
      include: {
        item: true,
        supplier: true,
        stockBalances: true,
      },
    });
    if (!batch) throw new NotFoundException(`Batch ${id} not found`);
    return batch;
  }
}
