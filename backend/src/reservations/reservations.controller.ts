import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { transferStockSchema } from '@farm-sales/shared';
import type { TransferStockDto } from '@farm-sales/shared';
import { AuthenticatedGuard } from '../auth/guards/authenticated.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { SafeUser } from '../auth/auth.service.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { ReservationsService } from './reservations.service.js';

@Controller('reservations')
@UseGuards(AuthenticatedGuard)
export class ReservationsController {
  constructor(private readonly reservations: ReservationsService) {}

  // Owner and warehouse staff move reserved stock between platforms and free stock.
  @Post('transfer')
  @UseGuards(RolesGuard)
  @Roles('OWNER', 'WAREHOUSE')
  transfer(@Body(new ZodValidationPipe(transferStockSchema)) dto: TransferStockDto, @CurrentUser() user: SafeUser) {
    return this.reservations.transfer(dto, user.id);
  }

  @Get('events')
  events(@Query('itemId') itemId: string, @Query('limit') limit?: string) {
    return this.reservations.events(itemId, limit ? Number(limit) : undefined);
  }
}
