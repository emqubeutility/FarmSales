import { Module } from '@nestjs/common';
import { StockModule } from '../stock/stock.module.js';
import { BatchesModule } from '../batches/batches.module.js';
import { GoodsReceiptsController } from './goods-receipts.controller.js';
import { GoodsReceiptsService } from './goods-receipts.service.js';

@Module({
  imports: [StockModule, BatchesModule],
  controllers: [GoodsReceiptsController],
  providers: [GoodsReceiptsService],
})
export class GoodsReceiptsModule {}
