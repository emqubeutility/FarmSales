import { Module } from '@nestjs/common';
import { StockModule } from '../stock/stock.module.js';
import { DocumentSeriesModule } from '../document-series/document-series.module.js';
import { ReturnsController } from './returns.controller.js';
import { ReturnsService } from './returns.service.js';

@Module({
  imports: [StockModule, DocumentSeriesModule],
  controllers: [ReturnsController],
  providers: [ReturnsService],
})
export class ReturnsModule {}
