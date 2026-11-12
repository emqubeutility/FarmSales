import { Injectable } from '@nestjs/common';
import { GRANTABLE_ROLES, MENU_ROUTES, pagesFor } from '@farm-sales/shared';
import type { GrantableRole, RoleMenuMatrix, UpdateRoleMenuDto } from '@farm-sales/shared';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuditLogService } from '../common/audit-log.service.js';

// Which sidebar pages each non-owner role may open. Owner always has every page.
@Injectable()
export class MenuAccessService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
  ) {}

  // The stored matrix, with each role's pages in sidebar order.
  async matrix(): Promise<RoleMenuMatrix> {
    const rows = await this.prisma.roleMenuAccess.findMany({ select: { role: true, route: true } });
    const matrix: Record<GrantableRole, string[]> = { CASHIER: [], WAREHOUSE: [], DELIVERY: [] };
    for (const row of rows) {
      if ((GRANTABLE_ROLES as readonly string[]).includes(row.role)) {
        matrix[row.role as GrantableRole].push(row.route);
      }
    }
    for (const role of GRANTABLE_ROLES) {
      matrix[role].sort((a, b) => MENU_ROUTES.indexOf(a) - MENU_ROUTES.indexOf(b));
    }
    return matrix;
  }

  // The pages a signed-in user may open, in sidebar order.
  async pagesForUser(roles: string[]): Promise<string[]> {
    return pagesFor(roles, await this.matrix());
  }

  // Replaces the whole page list for one role, and logs the change in the same transaction.
  async setRoutes(role: GrantableRole, dto: UpdateRoleMenuDto, userId: string): Promise<{ role: GrantableRole; routes: string[] }> {
    const before = (await this.matrix())[role];
    const routes = [...new Set(dto.routes)].sort((a, b) => MENU_ROUTES.indexOf(a) - MENU_ROUTES.indexOf(b));
    await this.prisma.$transaction(async (tx) => {
      await tx.roleMenuAccess.deleteMany({ where: { role } });
      if (routes.length > 0) {
        await tx.roleMenuAccess.createMany({ data: routes.map((route) => ({ role, route })) });
      }
      await this.auditLog.record(tx, {
        userId,
        entity: 'RoleMenuAccess',
        entityId: role,
        action: 'update',
        before: { routes: before },
        after: { routes },
      });
    });
    return { role, routes };
  }
}
