import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { createItemSchema, listItemsQuerySchema, updateItemSchema } from '@farm-sales/shared';
import type { CreateItemDto, ListItemsQuery, UpdateItemDto } from '@farm-sales/shared';
import { AuthenticatedGuard } from '../auth/guards/authenticated.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { SafeUser } from '../auth/auth.service.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { ItemsService } from './items.service.js';

@Controller('items')
@UseGuards(AuthenticatedGuard)
export class ItemsController {
  constructor(private readonly items: ItemsService) {}

  @Get()
  list(@Query(new ZodValidationPipe(listItemsQuerySchema)) query: ListItemsQuery) {
    return this.items.list(query);
  }

  @Get('inventory')
  inventory() {
    return this.items.inventory();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.items.findOne(id);
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles('OWNER', 'WAREHOUSE')
  create(@Body(new ZodValidationPipe(createItemSchema)) dto: CreateItemDto, @CurrentUser() user: SafeUser) {
    return this.items.create(dto, user.id);
  }

  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles('OWNER', 'WAREHOUSE')
  update(@Param('id') id: string, @Body(new ZodValidationPipe(updateItemSchema)) dto: UpdateItemDto, @CurrentUser() user: SafeUser) {
    return this.items.update(id, dto, user.id);
  }

  @Post(':id/deactivate')
  @UseGuards(RolesGuard)
  @Roles('OWNER', 'WAREHOUSE')
  deactivate(@Param('id') id: string, @CurrentUser() user: SafeUser) {
    return this.items.deactivate(id, user.id);
  }
}
