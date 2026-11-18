import { Module } from '@nestjs/common';
import { MarketplacesController } from './marketplaces.controller.js';
import { MarketplacesService } from './marketplaces.service.js';
import { FlipkartAdapter } from './flipkart.adapter.js';

@Module({
  controllers: [MarketplacesController],
  providers: [MarketplacesService, FlipkartAdapter],
  exports: [MarketplacesService],
})
export class MarketplacesModule {}
