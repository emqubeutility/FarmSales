import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AuthenticatedGuard } from '../auth/guards/authenticated.guard.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { SafeUser } from '../auth/auth.service.js';
import { DashboardService, type DashboardRange } from './dashboard.service.js';

@Controller('dashboard')
@UseGuards(AuthenticatedGuard)
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  // Gross profit is shown to the owner only.
  @Get()
  summary(@Query('range') range: string | undefined, @CurrentUser() user: SafeUser) {
    const chosen: DashboardRange = range === '7d' || range === '30d' ? range : 'today';
    return this.dashboard.summary(chosen, user.roles.includes('OWNER'));
  }
}
