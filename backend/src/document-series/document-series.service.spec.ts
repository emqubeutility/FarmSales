import { NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { DocumentSeriesService } from './document-series.service.js';
import { AuditLogService } from '../common/audit-log.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

describe('DocumentSeriesService.allocateNext', () => {
  it('formats the allocated number with a 6-digit zero-padded suffix', async () => {
    const client = {
      documentSeries: {
        update: vi.fn().mockResolvedValue({ prefix: 'MK-', nextNo: 126 }),
      },
    };
    const prisma = {} as PrismaService;
    const service = new DocumentSeriesService(prisma, new AuditLogService());

    const billNo = await service.allocateNext('MK-', client as never);

    expect(billNo).toBe('MK-000125');
    expect(client.documentSeries.update).toHaveBeenCalledWith({ where: { prefix: 'MK-' }, data: { nextNo: { increment: 1 } } });
  });

  it('throws NotFoundException when the series does not exist', async () => {
    const notFound = new Prisma.PrismaClientKnownRequestError('No record found', { code: 'P2025', clientVersion: '5.22.0' });
    const client = { documentSeries: { update: vi.fn().mockRejectedValue(notFound) } };
    const prisma = {} as PrismaService;
    const service = new DocumentSeriesService(prisma, new AuditLogService());

    await expect(service.allocateNext('XX-', client as never)).rejects.toThrow(NotFoundException);
  });
});
