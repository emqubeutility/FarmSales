import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { createGoodsReceiptSchema, updateGoodsReceiptSchema } from '@farm-sales/shared';
import type { CreateGoodsReceiptDto, UpdateGoodsReceiptDto } from '@farm-sales/shared';
import { AuthenticatedGuard } from '../auth/guards/authenticated.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { SafeUser } from '../auth/auth.service.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { GoodsReceiptsService } from './goods-receipts.service.js';

// Goods receipts carry supplier cost data — restricted to the same roles that can create one,
// not open to every authenticated role the way Items/Batches reads are.
@Controller('goods-receipts')
@UseGuards(AuthenticatedGuard, RolesGuard)
@Roles('OWNER', 'WAREHOUSE')
export class GoodsReceiptsController {
  constructor(private readonly goodsReceipts: GoodsReceiptsService) {}

  @Get()
  list() {
    return this.goodsReceipts.list();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.goodsReceipts.findOne(id);
  }

  @Post()
  create(@Body(new ZodValidationPipe(createGoodsReceiptSchema)) dto: CreateGoodsReceiptDto, @CurrentUser() user: SafeUser) {
    return this.goodsReceipts.create(dto, user.id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body(new ZodValidationPipe(updateGoodsReceiptSchema)) dto: UpdateGoodsReceiptDto, @CurrentUser() user: SafeUser) {
    return this.goodsReceipts.update(id, dto, user.id);
  }

  @Post(':id/void')
  void(@Param('id') id: string, @CurrentUser() user: SafeUser) {
    return this.goodsReceipts.void(id, user.id);
  }
}
