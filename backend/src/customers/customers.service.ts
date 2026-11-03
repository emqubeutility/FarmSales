import { Injectable, NotFoundException } from '@nestjs/common';
import { CreateCustomerDto, UpdateCustomerDto } from '@farm-sales/shared';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuditLogService } from '../common/audit-log.service.js';

@Injectable()
export class CustomersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
  ) {}

  list() {
    return this.prisma.customer.findMany({ orderBy: { name: 'asc' } });
  }

  async findOne(id: string) {
    const customer = await this.prisma.customer.findUnique({ where: { id } });
    if (!customer) throw new NotFoundException(`Customer ${id} not found`);
    return customer;
  }

  async create(dto: CreateCustomerDto, userId: string) {
    return this.prisma.$transaction(async (tx) => {
      const customer = await tx.customer.create({ data: dto });
      await this.auditLog.record(tx, { userId, entity: 'Customer', entityId: customer.id, action: 'create', after: customer });
      return customer;
    });
  }

  async update(id: string, dto: UpdateCustomerDto, userId: string) {
    const before = await this.findOne(id);
    return this.prisma.$transaction(async (tx) => {
      const after = await tx.customer.update({ where: { id }, data: dto });
      await this.auditLog.record(tx, { userId, entity: 'Customer', entityId: id, action: 'update', before, after });
      return after;
    });
  }
}
