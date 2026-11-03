import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { createReturnSchema } from '@farm-sales/shared';
import type { CreateReturnDto } from '@farm-sales/shared';
import { AuthenticatedGuard } from '../auth/guards/authenticated.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { SafeUser } from '../auth/auth.service.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { ReturnsService } from './returns.service.js';

// Same roles as Sales — a return is just the reverse side of a sale.
@Controller('returns')
@UseGuards(AuthenticatedGuard, RolesGuard)
@Roles('OWNER', 'CASHIER')
export class ReturnsController {
  constructor(private readonly returns: ReturnsService) {}

  @Get()
  list() {
    return this.returns.list();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.returns.findOne(id);
  }

  @Post()
  create(@Body(new ZodValidationPipe(createReturnSchema)) dto: CreateReturnDto, @CurrentUser() user: SafeUser) {
    return this.returns.create(dto, user.id);
  }
}
