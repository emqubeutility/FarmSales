import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { setChannelDiscountSchema } from '@farm-sales/shared';
import type { SetChannelDiscountDto } from '@farm-sales/shared';
import { AuthenticatedGuard } from '../auth/guards/authenticated.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { SafeUser } from '../auth/auth.service.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { ChannelDiscountsService } from './channel-discounts.service.js';

@Controller('channel-discounts')
@UseGuards(AuthenticatedGuard)
export class ChannelDiscountsController {
  constructor(private readonly channelDiscounts: ChannelDiscountsService) {}

  @Get()
  list() {
    return this.channelDiscounts.list();
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles('OWNER')
  set(@Body(new ZodValidationPipe(setChannelDiscountSchema)) dto: SetChannelDiscountDto, @CurrentUser() user: SafeUser) {
    return this.channelDiscounts.set(dto, user.id);
  }
}
