import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { createCustomerSchema, updateCustomerSchema } from '@farm-sales/shared';
import type { CreateCustomerDto, UpdateCustomerDto } from '@farm-sales/shared';
import { AuthenticatedGuard } from '../auth/guards/authenticated.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { SafeUser } from '../auth/auth.service.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { CustomersService } from './customers.service.js';

@Controller('customers')
@UseGuards(AuthenticatedGuard)
export class CustomersController {
  constructor(private readonly customers: CustomersService) {}

  @Get()
  list() {
    return this.customers.list();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.customers.findOne(id);
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles('OWNER')
  create(@Body(new ZodValidationPipe(createCustomerSchema)) dto: CreateCustomerDto, @CurrentUser() user: SafeUser) {
    return this.customers.create(dto, user.id);
  }

  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles('OWNER')
  update(@Param('id') id: string, @Body(new ZodValidationPipe(updateCustomerSchema)) dto: UpdateCustomerDto, @CurrentUser() user: SafeUser) {
    return this.customers.update(id, dto, user.id);
  }
}
