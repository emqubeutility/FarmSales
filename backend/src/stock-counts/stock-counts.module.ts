import { Module } from '@nestjs/common';
import { StockModule } from '../stock/stock.module.js';
import { StockCountsController } from './stock-counts.controller.js';
import { StockCountsService } from './stock-counts.service.js';

@Module({
  imports: [StockModule],
  controllers: [StockCountsController],
  providers: [StockCountsService],
})
export class StockCountsModule {}
