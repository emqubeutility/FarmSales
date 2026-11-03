import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { CreateDocumentSeriesDto, UpdateDocumentSeriesDto } from '@farm-sales/shared';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuditLogService } from '../common/audit-log.service.js';
import type { PrismaTx } from '../common/prisma-tx.type.js';

@Injectable()
export class DocumentSeriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
  ) {}

  list() {
    return this.prisma.documentSeries.findMany({ orderBy: { prefix: 'asc' } });
  }

  async create(dto: CreateDocumentSeriesDto, userId: string) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const series = await tx.documentSeries.create({ data: dto });
        await this.auditLog.record(tx, {
          userId,
          entity: 'DocumentSeries',
          entityId: series.id,
          action: 'create',
          after: series,
        });
        return series;
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException(`Document series "${dto.prefix}" already exists`);
      }
      throw err;
    }
  }

  async update(id: string, dto: UpdateDocumentSeriesDto, userId: string) {
    const before = await this.prisma.documentSeries.findUnique({ where: { id } });
    if (!before) throw new NotFoundException(`Document series ${id} not found`);
    return this.prisma.$transaction(async (tx) => {
      const after = await tx.documentSeries.update({ where: { id }, data: { nextNo: dto.nextNo } });
      await this.auditLog.record(tx, { userId, entity: 'DocumentSeries', entityId: id, action: 'update', before, after });
      return after;
    });
  }

  /**
   * Atomically allocates the next number for `prefix` and returns the formatted bill number
   * (e.g. "MK-000125"). Pass the enclosing transaction's client so this allocation commits (or
   * rolls back) together with the sale that uses it — per HANDOVER.md section 5, number series
   * are allocated in the same transaction as finalisation, never at draft, so there are no gaps.
   */
  async allocateNext(prefix: string, client: PrismaTx = this.prisma): Promise<string> {
    let updated;
    try {
      updated = await client.documentSeries.update({
        where: { prefix },
        data: { nextNo: { increment: 1 } },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
        throw new NotFoundException(`Document series "${prefix}" not found`);
      }
      throw err;
    }
    const allocated = updated.nextNo - 1;
    return `${prefix}${String(allocated).padStart(6, '0')}`;
  }
}
