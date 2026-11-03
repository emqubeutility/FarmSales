import { Module } from '@nestjs/common';
import { ChannelDiscountsController } from './channel-discounts.controller.js';
import { ChannelDiscountsService } from './channel-discounts.service.js';

@Module({
  controllers: [ChannelDiscountsController],
  providers: [ChannelDiscountsService],
  exports: [ChannelDiscountsService],
})
export class ChannelDiscountsModule {}
