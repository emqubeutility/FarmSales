import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { createStockCountSchema, setStockCountLinesSchema } from '@farm-sales/shared';
import type { CreateStockCountDto, SetStockCountLinesDto } from '@farm-sales/shared';
import { AuthenticatedGuard } from '../auth/guards/authenticated.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { SafeUser } from '../auth/auth.service.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { StockCountsService } from './stock-counts.service.js';

@Controller('stock-counts')
@UseGuards(AuthenticatedGuard)
export class StockCountsController {
  constructor(private readonly stockCounts: StockCountsService) {}

  @Get()
  list() {
    return this.stockCounts.list();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.stockCounts.findOne(id);
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles('OWNER', 'WAREHOUSE')
  create(@Body(new ZodValidationPipe(createStockCountSchema)) dto: CreateStockCountDto, @CurrentUser() user: SafeUser) {
    return this.stockCounts.create(dto, user.id);
  }

  @Patch(':id/lines')
  @UseGuards(RolesGuard)
  @Roles('OWNER', 'WAREHOUSE')
  setLines(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(setStockCountLinesSchema)) dto: SetStockCountLinesDto,
    @CurrentUser() user: SafeUser,
  ) {
    return this.stockCounts.setLines(id, dto, user.id);
  }

  @Post(':id/close')
  @UseGuards(RolesGuard)
  @Roles('OWNER', 'WAREHOUSE')
  close(@Param('id') id: string, @CurrentUser() user: SafeUser) {
    return this.stockCounts.close(id, user.id);
  }
}
