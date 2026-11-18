import { Controller, Get, Header, UseGuards } from '@nestjs/common';
import { AuthenticatedGuard } from '../auth/guards/authenticated.guard.js';
import { PowerBiService } from './powerbi.service.js';

@Controller('powerbi')
@UseGuards(AuthenticatedGuard)
export class PowerBiController {
  constructor(private readonly powerBi: PowerBiService) {}

  // The embed token is short-lived and per request, so it must never be cached by the browser or a proxy.
  @Get('embed')
  @Header('Cache-Control', 'no-store')
  embed() {
    return this.powerBi.embedForReport();
  }
}
