import { Body, Controller, Get, Param, Patch, Query, UseGuards } from '@nestjs/common';
import { updateBatchSchema } from '@farm-sales/shared';
import type { UpdateBatchDto } from '@farm-sales/shared';
import { AuthenticatedGuard } from '../auth/guards/authenticated.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { SafeUser } from '../auth/auth.service.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { BatchesService } from './batches.service.js';
import { PackUnitsService } from '../pack-units/pack-units.service.js';

@Controller('batches')
@UseGuards(AuthenticatedGuard)
export class BatchesController {
  constructor(
    private readonly batches: BatchesService,
    private readonly packUnits: PackUnitsService,
  ) {}

  // Pack labels still in stock for a batch. The label page prints one label for each.
  @Get(':id/units')
  inStockUnits(@Param('id') id: string) {
    return this.packUnits.listInStock(id);
  }

  // Correcting a best-before date changes what can be sold, so only Owner and Warehouse can do it.
  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles('OWNER', 'WAREHOUSE')
  updateBestBefore(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateBatchSchema)) dto: UpdateBatchDto,
    @CurrentUser() user: SafeUser,
  ) {
    return this.batches.updateBestBefore(id, dto, user.id);
  }

  @Get()
  list(@Query('itemId') itemId?: string, @Query('search') search?: string) {
    return this.batches.list({ itemId, search });
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.batches.findOne(id);
  }
}
