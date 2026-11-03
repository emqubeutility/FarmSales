import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { createCategorySchema, updateCategorySchema } from '@farm-sales/shared';
import type { CreateCategoryDto, UpdateCategoryDto } from '@farm-sales/shared';
import { AuthenticatedGuard } from '../auth/guards/authenticated.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { SafeUser } from '../auth/auth.service.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { CategoriesService } from './categories.service.js';

// Product categories (Rice, Atta, Ghee ...). Only the owner keeps this list, in Settings.
@Controller('categories')
@UseGuards(AuthenticatedGuard)
export class CategoriesController {
  constructor(private readonly categories: CategoriesService) {}

  @Get()
  list(@Query('active') active?: string) {
    return this.categories.list(active === 'true');
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles('OWNER')
  create(@Body(new ZodValidationPipe(createCategorySchema)) dto: CreateCategoryDto, @CurrentUser() user: SafeUser) {
    return this.categories.create(dto, user.id);
  }

  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles('OWNER')
  update(@Param('id') id: string, @Body(new ZodValidationPipe(updateCategorySchema)) dto: UpdateCategoryDto, @CurrentUser() user: SafeUser) {
    return this.categories.update(id, dto, user.id);
  }
}
