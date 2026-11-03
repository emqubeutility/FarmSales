import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { createStockAdjustmentSchema } from '@farm-sales/shared';
import type { CreateStockAdjustmentDto } from '@farm-sales/shared';
import { AuthenticatedGuard } from '../auth/guards/authenticated.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { SafeUser } from '../auth/auth.service.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { StockAdjustmentsService } from './stock-adjustments.service.js';

// Who approves adjustments is still an open decision (HANDOVER.md section 9); for now the same
// roles that manage items can also adjust their stock.
@Controller('stock-adjustments')
@UseGuards(AuthenticatedGuard, RolesGuard)
@Roles('OWNER', 'WAREHOUSE')
export class StockAdjustmentsController {
  constructor(private readonly stockAdjustments: StockAdjustmentsService) {}

  @Post()
  create(@Body(new ZodValidationPipe(createStockAdjustmentSchema)) dto: CreateStockAdjustmentDto, @CurrentUser() user: SafeUser) {
    return this.stockAdjustments.create(dto, user.id);
  }
}
