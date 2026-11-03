import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { AuthenticatedGuard } from '../auth/guards/authenticated.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { CreditNotesService } from './credit-notes.service.js';

@Controller('credit-notes')
@UseGuards(AuthenticatedGuard, RolesGuard)
@Roles('OWNER', 'CASHIER')
export class CreditNotesController {
  constructor(private readonly creditNotes: CreditNotesService) {}

  @Get()
  list() {
    return this.creditNotes.list();
  }

  @Get('by-number/:number')
  findByNumber(@Param('number') number: string) {
    return this.creditNotes.findByNumber(number);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.creditNotes.findOne(id);
  }
}
