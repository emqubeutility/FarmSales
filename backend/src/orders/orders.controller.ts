import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { cancelOrderSchema, createOrderSchema, dispatchOrderSchema, recordDeliverySchema } from '@farm-sales/shared';
import type { CancelOrderDto, CreateOrderDto, DispatchOrderDto, RecordDeliveryDto } from '@farm-sales/shared';
import { AuthenticatedGuard } from '../auth/guards/authenticated.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { SafeUser } from '../auth/auth.service.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { OrdersService } from './orders.service.js';

// Read access is broad — office staff, warehouse and delivery staff all need to see the order
// board. Each mutation is restricted to whoever actually performs that step.
@Controller('orders')
@UseGuards(AuthenticatedGuard)
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Get()
  list(@Query('status') status?: string) {
    return this.orders.list(status);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.orders.findOne(id);
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles('OWNER', 'CASHIER', 'WAREHOUSE')
  create(@Body(new ZodValidationPipe(createOrderSchema)) dto: CreateOrderDto, @CurrentUser() user: SafeUser) {
    return this.orders.create(dto, user.id);
  }

  @Post(':id/pack')
  @UseGuards(RolesGuard)
  @Roles('OWNER', 'WAREHOUSE')
  pack(@Param('id') id: string, @CurrentUser() user: SafeUser) {
    return this.orders.pack(id, user.id);
  }

  @Post(':id/dispatch')
  @UseGuards(RolesGuard)
  @Roles('OWNER', 'WAREHOUSE')
  dispatch(@Param('id') id: string, @Body(new ZodValidationPipe(dispatchOrderSchema)) dto: DispatchOrderDto, @CurrentUser() user: SafeUser) {
    return this.orders.dispatch(id, dto, user.id);
  }

  @Post(':id/record-delivery')
  @UseGuards(RolesGuard)
  @Roles('OWNER', 'WAREHOUSE', 'DELIVERY')
  recordDelivery(@Param('id') id: string, @Body(new ZodValidationPipe(recordDeliverySchema)) dto: RecordDeliveryDto, @CurrentUser() user: SafeUser) {
    return this.orders.recordDelivery(id, dto, user.id);
  }

  @Post(':id/mark-cash-received')
  @UseGuards(RolesGuard)
  @Roles('OWNER', 'CASHIER')
  markCashReceived(@Param('id') id: string, @CurrentUser() user: SafeUser) {
    return this.orders.markCashReceived(id, user.id);
  }

  @Post(':id/cancel')
  @UseGuards(RolesGuard)
  @Roles('OWNER', 'WAREHOUSE', 'DELIVERY')
  cancel(@Param('id') id: string, @Body(new ZodValidationPipe(cancelOrderSchema)) dto: CancelOrderDto, @CurrentUser() user: SafeUser) {
    return this.orders.cancel(id, dto, user.id);
  }
}
