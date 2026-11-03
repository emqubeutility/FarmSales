import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { CreateCategoryDto, UpdateCategoryDto } from '@farm-sales/shared';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuditLogService } from '../common/audit-log.service.js';

@Injectable()
export class CategoriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
  ) {}

  list(activeOnly: boolean) {
    return this.prisma.category.findMany({ where: activeOnly ? { active: true } : undefined, orderBy: { name: 'asc' } });
  }

  async create(dto: CreateCategoryDto, userId: string) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const category = await tx.category.create({ data: { name: dto.name } });
        await this.auditLog.record(tx, { userId, entity: 'Category', entityId: category.id, action: 'create', after: category });
        return category;
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException(`Category "${dto.name}" already exists`);
      }
      throw err;
    }
  }

  async update(id: string, dto: UpdateCategoryDto, userId: string) {
    const before = await this.prisma.category.findUnique({ where: { id } });
    if (!before) throw new NotFoundException(`Category ${id} not found`);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const after = await tx.category.update({ where: { id }, data: { name: dto.name, active: dto.active } });
        await this.auditLog.record(tx, { userId, entity: 'Category', entityId: id, action: 'update', before, after });
        return after;
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException(`Category "${dto.name}" already exists`);
      }
      throw err;
    }
  }
}
