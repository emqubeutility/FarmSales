import { Module } from '@nestjs/common';
import { StockModule } from '../stock/stock.module.js';
import { StockAdjustmentsController } from './stock-adjustments.controller.js';
import { StockAdjustmentsService } from './stock-adjustments.service.js';

@Module({
  imports: [StockModule],
  controllers: [StockAdjustmentsController],
  providers: [StockAdjustmentsService],
})
export class StockAdjustmentsModule {}
