import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { createSupplierSchema } from '@farm-sales/shared';
import type { CreateSupplierDto } from '@farm-sales/shared';
import { AuthenticatedGuard } from '../auth/guards/authenticated.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { SuppliersService } from './suppliers.service.js';

@Controller('suppliers')
@UseGuards(AuthenticatedGuard)
export class SuppliersController {
  constructor(private readonly suppliers: SuppliersService) {}

  @Get()
  list() {
    return this.suppliers.list();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.suppliers.findOne(id);
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles('OWNER', 'WAREHOUSE')
  create(@Body(new ZodValidationPipe(createSupplierSchema)) dto: CreateSupplierDto) {
    return this.suppliers.create(dto);
  }
}
