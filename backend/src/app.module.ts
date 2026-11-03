import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { UsersModule } from './users/users.module.js';
import { AuthModule } from './auth/auth.module.js';
import { CommonModule } from './common/common.module.js';
import { TaxClassesModule } from './tax-classes/tax-classes.module.js';
import { ItemsModule } from './items/items.module.js';
import { CategoriesModule } from './categories/categories.module.js';
import { DocumentSeriesModule } from './document-series/document-series.module.js';
import { StockModule } from './stock/stock.module.js';
import { SuppliersModule } from './suppliers/suppliers.module.js';
import { BatchesModule } from './batches/batches.module.js';
import { GoodsReceiptsModule } from './goods-receipts/goods-receipts.module.js';
import { StockAdjustmentsModule } from './stock-adjustments/stock-adjustments.module.js';
import { StockCountsModule } from './stock-counts/stock-counts.module.js';
import { ChannelDiscountsModule } from './channel-discounts/channel-discounts.module.js';
import { SalesModule } from './sales/sales.module.js';
import { CustomersModule } from './customers/customers.module.js';
import { ZonesModule } from './zones/zones.module.js';
import { ReturnsModule } from './returns/returns.module.js';
import { CreditNotesModule } from './credit-notes/credit-notes.module.js';
import { OrdersModule } from './orders/orders.module.js';
import { BusinessProfileModule } from './business-profile/business-profile.module.js';
import { PackUnitsModule } from './pack-units/pack-units.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    CommonModule,
    PackUnitsModule,
    UsersModule,
    AuthModule,
    TaxClassesModule,
    ItemsModule,
    CategoriesModule,
    DocumentSeriesModule,
    StockModule,
    SuppliersModule,
    BatchesModule,
    GoodsReceiptsModule,
    StockAdjustmentsModule,
    StockCountsModule,
    ChannelDiscountsModule,
    SalesModule,
    CustomersModule,
    ZonesModule,
    ReturnsModule,
    CreditNotesModule,
    OrdersModule,
    BusinessProfileModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
