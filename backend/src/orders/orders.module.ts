import { Module } from '@nestjs/common';
import { StockModule } from '../stock/stock.module.js';
import { DocumentSeriesModule } from '../document-series/document-series.module.js';
import { TaxClassesModule } from '../tax-classes/tax-classes.module.js';
import { OrdersController } from './orders.controller.js';
import { OrdersService } from './orders.service.js';

@Module({
  imports: [StockModule, DocumentSeriesModule, TaxClassesModule],
  controllers: [OrdersController],
  providers: [OrdersService],
  exports: [OrdersService],
})
export class OrdersModule {}
