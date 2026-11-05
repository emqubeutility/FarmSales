import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { calcBillTotals, calcDeliveryCharge, DiscountExceedsMaxError } from '@farm-sales/shared';
import type { CancelOrderDto, CreateOrderDto, DispatchOrderDto, RecordDeliveryDto } from '@farm-sales/shared';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuditLogService } from '../common/audit-log.service.js';
import { StockService } from '../stock/stock.service.js';
import { DocumentSeriesService } from '../document-series/document-series.service.js';
import { TaxClassesService } from '../tax-classes/tax-classes.service.js';
import { PackUnitsService } from '../pack-units/pack-units.service.js';

const include = {
  customer: true,
  zone: true,
  sale: true,
  lines: { include: { item: true, batches: { include: { batch: true } } } },
} as const;

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
    private readonly stock: StockService,
    private readonly documentSeries: DocumentSeriesService,
    private readonly taxClasses: TaxClassesService,
    private readonly packUnits: PackUnitsService,
  ) {}

  list(status?: string) {
    return this.prisma.order.findMany({
      where: status ? { status: status as never } : undefined,
      relationLoadStrategy: 'join',
      orderBy: { createdAt: 'desc' },
      include,
    });
  }

  async findOne(id: string) {
    const order = await this.prisma.order.findUnique({ where: { id }, relationLoadStrategy: 'join', include });
    if (!order) throw new NotFoundException(`Order ${id} not found`);
    return order;
  }

  /**
   * Totals are computed now (the customer needs a number to agree to on the phone/chat), but per
   * HANDOVER.md section 5 the bill number itself is only allocated at dispatch. Stock is only
   * informally "reserved" by the order existing — nothing yet blocks another sale from selling
   * the same units before this is packed; real reservation tracking isn't built in this pass.
   */
  async create(dto: CreateOrderDto, userId: string) {
    return this.prisma.$transaction(async (tx) => {
      const channelDiscount = await tx.channelDiscount.findUnique({ where: { channel: dto.channel } });
      if (!channelDiscount) throw new NotFoundException(`No discount configured for channel ${dto.channel}`);

      const billLines: { itemId: string; qty: number; mrpPaise: number; taxRatePct: number }[] = [];
      for (const line of dto.lines) {
        const item = await tx.item.findUnique({ where: { id: line.itemId } });
        if (!item) throw new NotFoundException(`Item ${line.itemId} not found`);
        const taxRatePct = await this.taxClasses.effectiveRatePct(tx, item.taxClassId);
        billLines.push({ itemId: item.id, qty: line.qty, mrpPaise: item.mrpPaise ?? 0, taxRatePct: taxRatePct.toNumber() });
      }

      let totals;
      try {
        totals = calcBillTotals(billLines, dto.discountPct, channelDiscount.maxPct.toNumber());
      } catch (err) {
        if (err instanceof DiscountExceedsMaxError) throw new BadRequestException(err.message);
        throw err;
      }

      let deliveryChargePaise = 0;
      if (dto.zoneId) {
        const zone = await tx.deliveryZone.findUnique({ where: { id: dto.zoneId } });
        if (!zone) throw new NotFoundException(`Delivery zone ${dto.zoneId} not found`);
        deliveryChargePaise = calcDeliveryCharge(totals.totalPaise, { feePaise: zone.feePaise, freeFromPaise: zone.freeFromPaise });
      }

      const code = await this.documentSeries.allocateNext('OR-', tx);

      const order = await tx.order.create({
        data: {
          code,
          channel: dto.channel,
          salesPoint: dto.salesPoint,
          paymentPlan: dto.paymentPlan,
          prepaidMode: dto.paymentPlan === 'PREPAID' ? dto.prepaidMode : undefined,
          prepaidReference: dto.paymentPlan === 'PREPAID' ? dto.prepaidReference : undefined,
          customerId: dto.customerId,
          customerName: dto.customerName,
          customerPhone: dto.customerPhone,
          deliveryAddress: dto.deliveryAddress,
          zoneId: dto.zoneId,
          discountPct: dto.discountPct,
          grossPaise: totals.grossPaise,
          discountPaise: totals.discountPaise,
          netPaise: totals.netPaise,
          taxablePaise: totals.taxablePaise,
          taxPaise: totals.taxPaise,
          roundOffPaise: totals.roundOffPaise,
          deliveryChargePaise,
          totalPaise: totals.totalPaise + deliveryChargePaise,
        },
      });

      for (const line of billLines) {
        await tx.orderLine.create({ data: { orderId: order.id, itemId: line.itemId, qty: line.qty, mrpPaise: line.mrpPaise, taxRatePct: line.taxRatePct } });
      }

      await this.auditLog.record(tx, { userId, entity: 'Order', entityId: order.id, action: 'create', after: { code: order.code, totalPaise: order.totalPaise } });
      return tx.order.findUnique({ where: { id: order.id }, include });
    });
  }

  /** FEFO-allocates and decrements stock for every line — the real stock movement, done once. */
  async pack(id: string, userId: string) {
    return this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({ where: { id }, include: { lines: true } });
      if (!order) throw new NotFoundException(`Order ${id} not found`);
      if (order.status !== 'NEW') throw new BadRequestException('Only a new order can be packed');

      for (const line of order.lines) {
        const allocations = await this.stock.decrementFefo(tx, {
          itemId: line.itemId,
          qty: line.qty.toNumber(),
          reason: 'SALE',
          refType: 'Order',
          refId: id,
        });
        for (const allocation of allocations) {
          await tx.orderLineBatch.create({ data: { orderLineId: line.id, batchId: allocation.batchId, qty: allocation.qty } });
          await this.packUnits.take(tx, line.itemId, allocation.batchId, allocation.qty, `Order:${id}`);
        }
      }

      await tx.order.update({ where: { id }, data: { status: 'PACKED', packedAt: new Date() } });
      await this.auditLog.record(tx, { userId, entity: 'Order', entityId: id, action: 'pack' });
      return tx.order.findUnique({ where: { id }, include });
    });
  }

  /**
   * Creates the actual bill — a FINALIZED Sale with a real number from the right series. Stock
   * already moved at pack time, so this only records the paper trail. Unlike POS, a COD/pay-on-
   * delivery order's Payment rows don't exist yet (recordDelivery / markCashReceived add them
   * later) — this deliberately does not enforce "payments sum to total" the way Sales.finalize
   * does, because payment genuinely hasn't happened yet for those payment plans.
   */
  async dispatch(id: string, dto: DispatchOrderDto, userId: string) {
    return this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({ where: { id }, include: { lines: { include: { batches: true } } } });
      if (!order) throw new NotFoundException(`Order ${id} not found`);
      if (order.status !== 'PACKED') throw new BadRequestException('Only a packed order can be dispatched');

      const prefix = order.salesPoint === 'MARKET_STALL' ? 'MK-' : 'WH-';
      const number = await this.documentSeries.allocateNext(prefix, tx);

      const sale = await tx.sale.create({
        data: {
          number,
          salesPoint: order.salesPoint,
          channel: order.channel,
          status: 'FINALIZED',
          discountPct: order.discountPct,
          grossPaise: order.grossPaise,
          discountPaise: order.discountPaise,
          netPaise: order.netPaise,
          taxablePaise: order.taxablePaise,
          taxPaise: order.taxPaise,
          roundOffPaise: order.roundOffPaise,
          deliveryChargePaise: order.deliveryChargePaise,
          totalPaise: order.totalPaise,
          finalizedAt: new Date(),
        },
      });

      for (const line of order.lines) {
        const saleLine = await tx.saleLine.create({
          data: { saleId: sale.id, itemId: line.itemId, qty: line.qty, mrpPaise: line.mrpPaise, taxRatePct: line.taxRatePct },
        });
        for (const batch of line.batches) {
          await tx.saleLineBatch.create({ data: { saleLineId: saleLine.id, batchId: batch.batchId, qty: batch.qty } });
        }
      }

      if (order.paymentPlan === 'PREPAID') {
        await tx.payment.create({
          data: { saleId: sale.id, mode: order.prepaidMode ?? 'UPI', amountPaise: order.totalPaise, reference: order.prepaidReference },
        });
      }

      await tx.order.update({
        where: { id },
        data: { status: 'DISPATCHED', saleId: sale.id, dispatchedAt: new Date(), deliveryStaffName: dto.deliveryStaffName },
      });
      await this.auditLog.record(tx, { userId, entity: 'Order', entityId: id, action: 'dispatch', after: { saleNumber: number } });
      return tx.order.findUnique({ where: { id }, include });
    });
  }

  /**
   * The delivery-staff phone screen. UPI is confirmed/traceable at the door, so it's recorded as
   * a Payment immediately; cash stays "with the delivery staff" until the office reconciles it
   * via markCashReceived — matches docs/mock/delivery.html exactly.
   */
  async recordDelivery(id: string, dto: RecordDeliveryDto, userId: string) {
    return this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({ where: { id } });
      if (!order) throw new NotFoundException(`Order ${id} not found`);
      if (order.status !== 'DISPATCHED') throw new BadRequestException('Only a dispatched order can be marked delivered');

      if (dto.collectedMode === 'UPI' && order.saleId) {
        await tx.payment.create({
          data: { saleId: order.saleId, mode: 'UPI', amountPaise: dto.collectedAmountPaise ?? order.totalPaise, reference: dto.reference },
        });
      }

      await tx.order.update({
        where: { id },
        data: { status: 'DELIVERED', deliveredAt: new Date(), collectedMode: dto.collectedMode, collectedAmountPaise: dto.collectedAmountPaise },
      });
      await this.auditLog.record(tx, { userId, entity: 'Order', entityId: id, action: 'deliver', after: { collectedMode: dto.collectedMode } });
      return tx.order.findUnique({ where: { id }, include });
    });
  }

  /** Office-side reconciliation: the cash the delivery staff was holding has now been handed over. */
  async markCashReceived(id: string, userId: string) {
    return this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({ where: { id } });
      if (!order) throw new NotFoundException(`Order ${id} not found`);
      if (order.status !== 'DELIVERED') throw new BadRequestException('Order must be delivered first');
      if (order.collectedMode !== 'CASH') throw new BadRequestException('Only a cash collection needs this step');
      if (order.cashHandedOverAt) throw new BadRequestException('Cash was already marked received');

      await tx.payment.create({
        data: { saleId: order.saleId!, mode: 'CASH', amountPaise: order.collectedAmountPaise ?? order.totalPaise },
      });
      const updated = await tx.order.update({ where: { id }, data: { cashHandedOverAt: new Date() } });
      await this.auditLog.record(tx, { userId, entity: 'Order', entityId: id, action: 'cash_received' });
      return updated;
    });
  }

  /**
   * Covers both an office-initiated cancellation (from NEW/PACKED) and the delivery-staff
   * "Delivery failed" button (from DISPATCHED) — docs/mock/orders.html shows a failed delivery
   * landing in the same Cancelled column, stock released. Any batches already allocated at pack
   * time are reversed; if a bill was already created (dispatched), it's voided too.
   */
  async cancel(id: string, dto: CancelOrderDto, userId: string) {
    return this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({
        where: { id },
        include: { lines: { include: { batches: { include: { batch: true } } } } },
      });
      if (!order) throw new NotFoundException(`Order ${id} not found`);
      if (order.status === 'DELIVERED' || order.status === 'CANCELLED') {
        throw new BadRequestException('Cannot cancel a delivered or already-cancelled order');
      }

      for (const line of order.lines) {
        for (const orderLineBatch of line.batches) {
          await this.stock.adjust(tx, {
            itemId: orderLineBatch.batch.itemId,
            batchId: orderLineBatch.batchId,
            qtyDelta: orderLineBatch.qty.toNumber(),
            reason: 'RETURN',
            refType: 'OrderCancel',
            refId: id,
          });
        }
      }
      // Packs taken when the order was packed go back on the shelf.
      await this.packUnits.release(tx, `Order:${id}`);

      if (order.saleId) {
        await tx.sale.update({ where: { id: order.saleId }, data: { status: 'VOID', voidedAt: new Date() } });
      }

      const updated = await tx.order.update({
        where: { id },
        data: { status: 'CANCELLED', cancelledAt: new Date(), cancelReason: dto.reason },
      });
      await this.auditLog.record(tx, { userId, entity: 'Order', entityId: id, action: 'cancel', after: { reason: dto.reason } });
      return updated;
    });
  }

}
