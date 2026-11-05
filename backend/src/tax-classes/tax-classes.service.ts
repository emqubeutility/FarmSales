import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { CreateTaxClassDto, CreateTaxRateDto, UpdateTaxClassDto } from '@farm-sales/shared';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuditLogService } from '../common/audit-log.service.js';
import type { PrismaTx } from '../common/prisma-tx.type.js';

@Injectable()
export class TaxClassesService {
  private readonly rateCache = new Map<string, { rates: { ratePct: Prisma.Decimal; effectiveFrom: Date }[]; expires: number }>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
  ) {}

  list() {
    return this.prisma.taxClass.findMany({
      relationLoadStrategy: 'join',
      orderBy: { name: 'asc' },
      include: { rates: { orderBy: { effectiveFrom: 'desc' } } },
    });
  }

  async findOne(id: string) {
    const taxClass = await this.prisma.taxClass.findUnique({
      where: { id },
      include: { rates: { orderBy: { effectiveFrom: 'desc' } } },
    });
    if (!taxClass) throw new NotFoundException(`Tax class ${id} not found`);
    return taxClass;
  }

  async create(dto: CreateTaxClassDto, userId: string) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const taxClass = await tx.taxClass.create({ data: dto });
        await this.auditLog.record(tx, { userId, entity: 'TaxClass', entityId: taxClass.id, action: 'create', after: taxClass });
        return taxClass;
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException(`Tax class "${dto.name}" already exists`);
      }
      throw err;
    }
  }

  async update(id: string, dto: UpdateTaxClassDto, userId: string) {
    const before = await this.findOne(id);
    return this.prisma.$transaction(async (tx) => {
      const after = await tx.taxClass.update({ where: { id }, data: dto });
      await this.auditLog.record(tx, { userId, entity: 'TaxClass', entityId: id, action: 'update', before, after });
      return after;
    });
  }

  async addRate(taxClassId: string, dto: CreateTaxRateDto, userId: string) {
    await this.findOne(taxClassId); // 404s if missing
    return this.prisma.$transaction(async (tx) => {
      const rate = await tx.taxRate.create({ data: { taxClassId, ratePct: dto.ratePct, effectiveFrom: dto.effectiveFrom } });
      this.rateCache.delete(taxClassId);
      await this.auditLog.record(tx, { userId, entity: 'TaxRate', entityId: rate.id, action: 'create', after: rate });
      return rate;
    });
  }

  /**
   * The rate in effect right now for a tax class — used at both Sales and Order creation so an
   * item's GST is looked up the same way everywhere. Effective-dated: a later rate change never
   * alters what's already been billed (HANDOVER.md section 2).
   */
  async effectiveRatePct(tx: PrismaTx, taxClassId: string | null): Promise<Prisma.Decimal> {
    if (!taxClassId) throw new BadRequestException('Item has no tax class and cannot be sold');
    // Rates change rarely, so keep each class's rate list in memory for a minute instead of paying a
    // database round trip per bill line. addRate() clears the cache; other server instances catch up
    // within the TTL. The effective-date check is still done against "now" on every call.
    const now = new Date();
    let cached = this.rateCache.get(taxClassId);
    if (!cached || cached.expires < Date.now()) {
      const rates = await tx.taxRate.findMany({ where: { taxClassId }, orderBy: { effectiveFrom: 'desc' } });
      cached = { rates, expires: Date.now() + 60_000 };
      this.rateCache.set(taxClassId, cached);
    }
    const rate = cached.rates.find((r) => r.effectiveFrom <= now);
    if (!rate) throw new BadRequestException(`No effective tax rate configured for tax class ${taxClassId}`);
    return rate.ratePct;
  }
}
