import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { CreateItemDto, freeQty, ListItemsQuery, ORDER_SOURCES, UpdateItemDto } from '@farm-sales/shared';
import type { OrderSource } from '@farm-sales/shared';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuditLogService } from '../common/audit-log.service.js';

// Reserved and held quantities for each order source, starting from zero.
function emptyPools(): Record<OrderSource, { reserved: number; held: number }> {
  return Object.fromEntries(ORDER_SOURCES.map((s) => [s, { reserved: 0, held: 0 }])) as Record<OrderSource, { reserved: number; held: number }>;
}

@Injectable()
export class ItemsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
  ) {}

  list(query: ListItemsQuery) {
    const where: Prisma.ItemWhereInput = {
      active: query.active ?? true,
      categoryId: query.categoryId,
      ...(query.search && {
        OR: [
          { name: { contains: query.search, mode: 'insensitive' } },
          { code: { contains: query.search, mode: 'insensitive' } },
          { ean13: { contains: query.search, mode: 'insensitive' } },
        ],
      }),
    };
    return this.prisma.item.findMany({ relationLoadStrategy: 'join', where, orderBy: { name: 'asc' }, include: { taxClass: true, category: true } });
  }

  /**
   * Stock per item. Each item carries its active batches (with on-hand qty) so the inventory screen
   * can show a total and let staff pick an exact batch to adjust.
   */
  async inventory() {
    const items = await this.prisma.item.findMany({
      relationLoadStrategy: 'join',
      where: { active: true },
      orderBy: { name: 'asc' },
      include: {
        category: true,
        batches: {
          where: { status: 'ACTIVE' },
          orderBy: { bestBefore: 'asc' },
          include: { stockBalances: true, supplier: true, channelReservations: true },
        },
      },
    });

    return items.map((item) => {
      const batches = item.batches
        .map((b) => ({
          id: b.id,
          code: b.code,
          bestBefore: b.bestBefore,
          supplier: b.supplier ? { name: b.supplier.name } : null,
          qty: b.stockBalances.find((sb) => sb.itemId === item.id)?.qty ?? new Prisma.Decimal(0),
          reservations: b.channelReservations.map((r) => ({
            source: r.source,
            reserved: r.reservedQty.toNumber(),
            held: r.heldQty.toNumber(),
          })),
        }))
        .filter((b) => b.qty.greaterThan(0));
      const totalQty = batches.reduce((sum, b) => sum.add(b.qty), new Prisma.Decimal(0));
      // Reserved and held per platform, per batch and in total. Free is on hand minus all reservations.
      const platforms = emptyPools();
      let freeTotal = 0;
      for (const b of item.batches) {
        const onHand = b.stockBalances.find((sb) => sb.itemId === item.id)?.qty.toNumber() ?? 0;
        if (onHand <= 0) continue;
        const reservedTotal = b.channelReservations.reduce((sum, r) => sum + r.reservedQty.toNumber(), 0);
        freeTotal += freeQty(onHand, reservedTotal);
        for (const r of b.channelReservations) {
          platforms[r.source].reserved += r.reservedQty.toNumber();
          platforms[r.source].held += r.heldQty.toNumber();
        }
      }

      return {
        id: item.id,
        code: item.code,
        name: item.name,
        size: item.size,
        unit: item.unit,
        category: item.category ? { id: item.category.id, name: item.category.name } : null,
        reorderLevel: item.reorderLevel,
        trackBatches: item.trackBatches,
        totalQty,
        freeQty: freeTotal,
        platforms,
        batches,
      };
    });
  }

  async findOne(id: string) {
    const item = await this.prisma.item.findUnique({ where: { id }, relationLoadStrategy: 'join', include: { taxClass: true, category: true } });
    if (!item) throw new NotFoundException(`Item ${id} not found`);
    return item;
  }

  async create(dto: CreateItemDto, userId: string) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const item = await tx.item.create({
          data: {
            code: dto.code,
            name: dto.name,
            size: dto.size,
            unit: dto.unit,
            ean13: dto.ean13,
            taxClassId: dto.taxClassId,
            categoryId: dto.categoryId,
            mrpPaise: dto.mrpPaise,
            shelfLifeDays: dto.shelfLifeDays,
            reorderLevel: dto.reorderLevel,
            trackBatches: dto.trackBatches,
          },
          include: { taxClass: true, category: true },
        });
        await this.auditLog.record(tx, { userId, entity: 'Item', entityId: item.id, action: 'create', after: item });
        return item;
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException(`Item code "${dto.code}" already exists`);
      }
      throw err;
    }
  }

  async update(id: string, dto: UpdateItemDto, userId: string) {
    const before = await this.findOne(id);
    return this.prisma.$transaction(async (tx) => {
      const after = await tx.item.update({
        where: { id },
        data: {
          code: dto.code,
          name: dto.name,
          size: dto.size,
          unit: dto.unit,
          ean13: dto.ean13,
          taxClassId: dto.taxClassId,
          categoryId: dto.categoryId,
          mrpPaise: dto.mrpPaise,
          shelfLifeDays: dto.shelfLifeDays,
          reorderLevel: dto.reorderLevel,
          trackBatches: dto.trackBatches,
          active: dto.active,
        },
        include: { taxClass: true, category: true },
      });
      await this.auditLog.record(tx, { userId, entity: 'Item', entityId: id, action: 'update', before, after });
      return after;
    });
  }

  async deactivate(id: string, userId: string) {
    return this.update(id, { active: false }, userId);
  }
}
