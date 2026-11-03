import { Injectable } from '@nestjs/common';
import type { Prisma, PrismaClient } from '@prisma/client';

export interface RecordAuditLogParams {
  userId: string;
  entity: string;
  entityId: string;
  action: string;
  before?: unknown;
  after?: unknown;
}

@Injectable()
export class AuditLogService {
  // Takes the client explicitly (a bare PrismaService or a $transaction callback's tx) so the
  // audit entry is written in the same transaction as the change it records, per HANDOVER.md
  // section 3 ("changes in settings are logged").
  record(client: PrismaClient | Prisma.TransactionClient, params: RecordAuditLogParams) {
    return client.auditLog.create({
      data: {
        userId: params.userId,
        entity: params.entity,
        entityId: params.entityId,
        action: params.action,
        beforeJson: (params.before ?? undefined) as Prisma.InputJsonValue | undefined,
        afterJson: (params.after ?? undefined) as Prisma.InputJsonValue | undefined,
      },
    });
  }
}
