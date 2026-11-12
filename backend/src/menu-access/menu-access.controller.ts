import { BadRequestException, Body, Controller, Get, Param, Put, UseGuards } from '@nestjs/common';
import { GRANTABLE_ROLES, updateRoleMenuSchema } from '@farm-sales/shared';
import type { GrantableRole, UpdateRoleMenuDto } from '@farm-sales/shared';
import { AuthenticatedGuard } from '../auth/guards/authenticated.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { SafeUser } from '../auth/auth.service.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { MenuAccessService } from './menu-access.service.js';

// Sidebar pages per role. Every signed-in user reads their own pages; only the owner changes them.
@Controller('menu-access')
@UseGuards(AuthenticatedGuard)
export class MenuAccessController {
  constructor(private readonly menu: MenuAccessService) {}

  @Get('me')
  async mine(@CurrentUser() user: SafeUser) {
    return { routes: await this.menu.pagesForUser(user.roles) };
  }

  @Get()
  @UseGuards(RolesGuard)
  @Roles('OWNER')
  matrix() {
    return this.menu.matrix();
  }

  @Put(':role')
  @UseGuards(RolesGuard)
  @Roles('OWNER')
  update(
    @Param('role') role: string,
    @Body(new ZodValidationPipe(updateRoleMenuSchema)) dto: UpdateRoleMenuDto,
    @CurrentUser() user: SafeUser,
  ) {
    if (!(GRANTABLE_ROLES as readonly string[]).includes(role)) {
      throw new BadRequestException('Pages can be set for Cashier, Warehouse and Delivery only');
    }
    return this.menu.setRoutes(role as GrantableRole, dto, user.id);
  }
}
