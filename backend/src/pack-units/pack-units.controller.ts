import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AuthenticatedGuard } from '../auth/guards/authenticated.guard.js';
import { PackUnitsService } from './pack-units.service.js';

@Controller('pack-units')
@UseGuards(AuthenticatedGuard)
export class PackUnitsController {
  constructor(private readonly packUnits: PackUnitsService) {}

  // The POS calls this with a scanned pack code. Returns the pack, its item and batch, and its status.
  @Get()
  findByCode(@Query('code') code: string) {
    return this.packUnits.findByCode(code);
  }
}
