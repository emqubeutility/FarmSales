import { Injectable, NotFoundException } from '@nestjs/common';
import { SetChannelDiscountDto, Channel } from '@farm-sales/shared';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuditLogService } from '../common/audit-log.service.js';

@Injectable()
export class ChannelDiscountsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
  ) {}

  list() {
    return this.prisma.channelDiscount.findMany({ orderBy: { channel: 'asc' } });
  }

  async findOne(channel: Channel) {
    const row = await this.prisma.channelDiscount.findUnique({ where: { channel } });
    if (!row) throw new NotFoundException(`No discount configured for channel ${channel}`);
    return row;
  }

  async set(dto: SetChannelDiscountDto, userId: string) {
    return this.prisma.$transaction(async (tx) => {
      const before = await tx.channelDiscount.findUnique({ where: { channel: dto.channel } });
      const after = await tx.channelDiscount.upsert({
        where: { channel: dto.channel },
        create: { channel: dto.channel, defaultPct: dto.defaultPct, maxPct: dto.maxPct },
        update: { defaultPct: dto.defaultPct, maxPct: dto.maxPct },
      });
      await this.auditLog.record(tx, {
        userId,
        entity: 'ChannelDiscount',
        entityId: dto.channel,
        action: before ? 'update' : 'create',
        before,
        after,
      });
      return after;
    });
  }
}
