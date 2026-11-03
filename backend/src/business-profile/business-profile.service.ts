import { Injectable } from '@nestjs/common';
import type { UpdateBusinessProfileDto } from '@farm-sales/shared';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuditLogService } from '../common/audit-log.service.js';

const SINGLETON_ID = 'singleton';

@Injectable()
export class BusinessProfileService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
  ) {}

  // Self-healing getOrCreate — no seed step required. Starts as a placeholder; CLAUDE.md forbids
  // inventing GSTIN/FSSAI/UPI details, so everything but the name-placeholder starts null.
  get() {
    return this.prisma.businessProfile.upsert({
      where: { id: SINGLETON_ID },
      create: { id: SINGLETON_ID, name: '[YOUR BRAND]' },
      update: {},
    });
  }

  async update(dto: UpdateBusinessProfileDto, userId: string) {
    const before = await this.get();
    const after = await this.prisma.businessProfile.update({ where: { id: SINGLETON_ID }, data: dto });
    await this.auditLog.record(this.prisma, { userId, entity: 'BusinessProfile', entityId: SINGLETON_ID, action: 'update', before, after });
    return after;
  }
}
