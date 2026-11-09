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

  // Every customer, with how many orders they placed and what they spent. Cancelled orders are left out.
  async list() {
    const [customers, totals] = await Promise.all([
      this.prisma.customer.findMany({ orderBy: { name: 'asc' } }),
      this.prisma.order.groupBy({
        by: ['customerId'],
        where: { customerId: { not: null }, status: { not: 'CANCELLED' } },
        _count: { _all: true },
        _sum: { totalPaise: true },
        _max: { createdAt: true },
      }),
    ]);
    const byCustomer = new Map(totals.map((t) => [t.customerId, t]));
    return customers.map((c) => {
      const t = byCustomer.get(c.id);
      return {
        ...c,
        orderCount: t?._count._all ?? 0,
        totalSpentPaise: t?._sum.totalPaise ?? 0,
        lastOrderAt: t?._max.createdAt ?? null,
      };
    });
  }

  // One customer with their orders, newest first.
  async findOne(id: string) {
    const customer = await this.prisma.customer.findUnique({ where: { id } });
    if (!customer) throw new NotFoundException(`Customer ${id} not found`);
    const orders = await this.prisma.order.findMany({
      where: { customerId: id },
      orderBy: { createdAt: 'desc' },
      take: 200,
      select: {
        id: true,
        code: true,
        status: true,
        channel: true,
        totalPaise: true,
        createdAt: true,
        sale: { select: { number: true } },
      },
    });
    return { ...customer, orders };
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
