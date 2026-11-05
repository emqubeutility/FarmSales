import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { finalizeSaleSchema, holdSaleSchema, resumeFinalizeSaleSchema, updateHeldSaleSchema } from '@farm-sales/shared';
import type { FinalizeSaleDto, HoldSaleDto, ResumeFinalizeSaleDto, UpdateHeldSaleDto } from '@farm-sales/shared';
import { AuthenticatedGuard } from '../auth/guards/authenticated.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { SafeUser } from '../auth/auth.service.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { SalesService } from './sales.service.js';

@Controller('sales')
@UseGuards(AuthenticatedGuard, RolesGuard)
@Roles('OWNER', 'CASHIER')
export class SalesController {
  constructor(private readonly sales: SalesService) {}

  @Get()
  list(@Query('limit') limit?: string) {
    const n = Number.parseInt(limit ?? '', 10);
    return this.sales.list(Number.isFinite(n) ? n : undefined);
  }

  @Get('held')
  listHeld() {
    return this.sales.listHeld();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.sales.findOne(id);
  }

  @Post('hold')
  hold(@Body(new ZodValidationPipe(holdSaleSchema)) dto: HoldSaleDto, @CurrentUser() user: SafeUser) {
    return this.sales.hold(dto, user.id);
  }

  @Post('finalize')
  finalize(@Body(new ZodValidationPipe(finalizeSaleSchema)) dto: FinalizeSaleDto, @CurrentUser() user: SafeUser) {
    return this.sales.finalize(dto, user.id);
  }

  @Post(':id/resume-finalize')
  resumeFinalize(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(resumeFinalizeSaleSchema)) dto: ResumeFinalizeSaleDto,
    @CurrentUser() user: SafeUser,
  ) {
    return this.sales.resumeFinalize(id, dto, user.id);
  }

  @Patch(':id')
  updateHeld(@Param('id') id: string, @Body(new ZodValidationPipe(updateHeldSaleSchema)) dto: UpdateHeldSaleDto, @CurrentUser() user: SafeUser) {
    return this.sales.updateHeld(id, dto, user.id);
  }

  @Delete(':id')
  deleteHeld(@Param('id') id: string, @CurrentUser() user: SafeUser) {
    return this.sales.deleteHeld(id, user.id);
  }

  @Post(':id/void')
  void(@Param('id') id: string, @CurrentUser() user: SafeUser) {
    return this.sales.void(id, user.id);
  }
}
