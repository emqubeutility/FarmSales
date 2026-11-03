import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { createZoneSchema, updateZoneSchema } from '@farm-sales/shared';
import type { CreateZoneDto, UpdateZoneDto } from '@farm-sales/shared';
import { AuthenticatedGuard } from '../auth/guards/authenticated.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { SafeUser } from '../auth/auth.service.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { ZonesService } from './zones.service.js';

@Controller('zones')
@UseGuards(AuthenticatedGuard)
export class ZonesController {
  constructor(private readonly zones: ZonesService) {}

  @Get()
  list() {
    return this.zones.list();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.zones.findOne(id);
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles('OWNER')
  create(@Body(new ZodValidationPipe(createZoneSchema)) dto: CreateZoneDto, @CurrentUser() user: SafeUser) {
    return this.zones.create(dto, user.id);
  }

  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles('OWNER')
  update(@Param('id') id: string, @Body(new ZodValidationPipe(updateZoneSchema)) dto: UpdateZoneDto, @CurrentUser() user: SafeUser) {
    return this.zones.update(id, dto, user.id);
  }
}
