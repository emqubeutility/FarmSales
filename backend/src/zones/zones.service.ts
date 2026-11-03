import { Injectable, NotFoundException } from '@nestjs/common';
import { CreateZoneDto, UpdateZoneDto } from '@farm-sales/shared';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuditLogService } from '../common/audit-log.service.js';

@Injectable()
export class ZonesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
  ) {}

  list() {
    return this.prisma.deliveryZone.findMany({ orderBy: { name: 'asc' } });
  }

  async findOne(id: string) {
    const zone = await this.prisma.deliveryZone.findUnique({ where: { id } });
    if (!zone) throw new NotFoundException(`Delivery zone ${id} not found`);
    return zone;
  }

  async create(dto: CreateZoneDto, userId: string) {
    return this.prisma.$transaction(async (tx) => {
      const zone = await tx.deliveryZone.create({ data: dto });
      await this.auditLog.record(tx, { userId, entity: 'DeliveryZone', entityId: zone.id, action: 'create', after: zone });
      return zone;
    });
  }

  async update(id: string, dto: UpdateZoneDto, userId: string) {
    const before = await this.findOne(id);
    return this.prisma.$transaction(async (tx) => {
      const after = await tx.deliveryZone.update({ where: { id }, data: dto });
      await this.auditLog.record(tx, { userId, entity: 'DeliveryZone', entityId: id, action: 'update', before, after });
      return after;
    });
  }
}
