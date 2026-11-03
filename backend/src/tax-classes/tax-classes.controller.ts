import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { createTaxClassSchema, createTaxRateSchema, updateTaxClassSchema } from '@farm-sales/shared';
import type { CreateTaxClassDto, CreateTaxRateDto, UpdateTaxClassDto } from '@farm-sales/shared';
import { AuthenticatedGuard } from '../auth/guards/authenticated.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { SafeUser } from '../auth/auth.service.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { TaxClassesService } from './tax-classes.service.js';

@Controller('tax-classes')
@UseGuards(AuthenticatedGuard)
export class TaxClassesController {
  constructor(private readonly taxClasses: TaxClassesService) {}

  @Get()
  list() {
    return this.taxClasses.list();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.taxClasses.findOne(id);
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles('OWNER')
  create(@Body(new ZodValidationPipe(createTaxClassSchema)) dto: CreateTaxClassDto, @CurrentUser() user: SafeUser) {
    return this.taxClasses.create(dto, user.id);
  }

  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles('OWNER')
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateTaxClassSchema)) dto: UpdateTaxClassDto,
    @CurrentUser() user: SafeUser,
  ) {
    return this.taxClasses.update(id, dto, user.id);
  }

  @Post(':id/rates')
  @UseGuards(RolesGuard)
  @Roles('OWNER')
  addRate(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(createTaxRateSchema)) dto: CreateTaxRateDto,
    @CurrentUser() user: SafeUser,
  ) {
    return this.taxClasses.addRate(id, dto, user.id);
  }
}
