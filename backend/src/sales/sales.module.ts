import { Module } from '@nestjs/common';
import { StockModule } from '../stock/stock.module.js';
import { DocumentSeriesModule } from '../document-series/document-series.module.js';
import { TaxClassesModule } from '../tax-classes/tax-classes.module.js';
import { SalesController } from './sales.controller.js';
import { SalesService } from './sales.service.js';

@Module({
  imports: [StockModule, DocumentSeriesModule, TaxClassesModule],
  controllers: [SalesController],
  providers: [SalesService],
})
export class SalesModule {}
