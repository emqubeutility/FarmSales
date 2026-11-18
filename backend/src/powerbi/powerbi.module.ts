import { Module } from '@nestjs/common';
import { PowerBiController } from './powerbi.controller.js';
import { PowerBiService } from './powerbi.service.js';

@Module({
  controllers: [PowerBiController],
  providers: [PowerBiService],
})
export class PowerBiModule {}
