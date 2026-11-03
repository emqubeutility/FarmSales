import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { createUserSchema, updateUserSchema } from '@farm-sales/shared';
import type { CreateUserDto, UpdateUserDto } from '@farm-sales/shared';
import { AuthenticatedGuard } from '../auth/guards/authenticated.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { SafeUser } from '../auth/auth.service.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { UsersService } from './users.service.js';

@Controller('users')
@UseGuards(AuthenticatedGuard, RolesGuard)
@Roles('OWNER')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  list() {
    return this.users.list();
  }

  @Post()
  create(@Body(new ZodValidationPipe(createUserSchema)) dto: CreateUserDto, @CurrentUser() user: SafeUser) {
    return this.users.create(dto, user.id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body(new ZodValidationPipe(updateUserSchema)) dto: UpdateUserDto, @CurrentUser() user: SafeUser) {
    return this.users.update(id, dto, user.id);
  }
}
