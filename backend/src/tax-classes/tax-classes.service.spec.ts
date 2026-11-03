import { NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { TaxClassesService } from './tax-classes.service.js';
import { AuditLogService } from '../common/audit-log.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

describe('TaxClassesService.addRate', () => {
  it('throws NotFoundException when the tax class does not exist', async () => {
    const prisma = { taxClass: { findUnique: vi.fn().mockResolvedValue(null) } } as unknown as PrismaService;
    const service = new TaxClassesService(prisma, new AuditLogService());

    await expect(service.addRate('missing-id', { ratePct: 5, effectiveFrom: new Date() }, 'user-1')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('creates the rate and records an audit entry for an existing tax class', async () => {
    const tx = {
      taxRate: { create: vi.fn().mockResolvedValue({ id: 'rate-1', taxClassId: 'tc-1', ratePct: 5 }) },
      auditLog: { create: vi.fn() },
    };
    const prisma = {
      taxClass: { findUnique: vi.fn().mockResolvedValue({ id: 'tc-1', name: 'Flours' }) },
      $transaction: vi.fn((cb: (tx: typeof tx) => unknown) => cb(tx)),
    } as unknown as PrismaService;
    const service = new TaxClassesService(prisma, new AuditLogService());

    const effectiveFrom = new Date('2026-10-01');
    await service.addRate('tc-1', { ratePct: 5, effectiveFrom }, 'user-1');

    expect(tx.taxRate.create).toHaveBeenCalledWith({ data: { taxClassId: 'tc-1', ratePct: 5, effectiveFrom } });
    expect(tx.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ action: 'create', entity: 'TaxRate' }) }));
  });
});
