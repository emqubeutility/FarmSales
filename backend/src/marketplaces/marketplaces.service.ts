import { BadRequestException, Injectable } from '@nestjs/common';
import { MARKETPLACE_LABELS, MARKETPLACES } from '@farm-sales/shared';
import type { Marketplace, MarketplaceListingsDto, MarketplaceStatus } from '@farm-sales/shared';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuditLogService } from '../common/audit-log.service.js';
import { FlipkartAdapter } from './flipkart.adapter.js';
import type { MarketplaceAdapter } from './marketplace-adapter.js';

@Injectable()
export class MarketplacesService {
  // Marketplaces without an adapter yet report NOT_STARTED.
  private readonly adapters: Partial<Record<Marketplace, MarketplaceAdapter>>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
    flipkart: FlipkartAdapter,
  ) {
    this.adapters = { FLIPKART: flipkart };
  }

  statuses(): MarketplaceStatus[] {
    return MARKETPLACES.map((marketplace) => ({
      marketplace,
      label: MARKETPLACE_LABELS[marketplace],
      state: this.adapters[marketplace]?.connectionState() ?? 'NOT_STARTED',
    }));
  }

  // The items listed on one marketplace, with the seller SKU used there.
  listings(marketplace: Marketplace) {
    return this.prisma.marketplaceListing.findMany({
      where: { marketplace },
      select: { itemId: true, marketplaceSku: true },
      orderBy: { marketplaceSku: 'asc' },
    });
  }

  // Replaces the whole listing set for one marketplace, and logs the change in the same transaction.
  async setListings(marketplace: Marketplace, dto: MarketplaceListingsDto, userId: string) {
    const itemIds = dto.listings.map((row) => row.itemId);
    const existing = await this.prisma.item.count({ where: { id: { in: itemIds } } });
    if (existing !== itemIds.length) throw new BadRequestException('One or more items do not exist');

    const before = await this.listings(marketplace);
    await this.prisma.$transaction(async (tx) => {
      await tx.marketplaceListing.deleteMany({ where: { marketplace } });
      if (dto.listings.length > 0) {
        await tx.marketplaceListing.createMany({
          data: dto.listings.map((row) => ({ marketplace, itemId: row.itemId, marketplaceSku: row.marketplaceSku })),
        });
      }
      await this.auditLog.record(tx, {
        userId,
        entity: 'MarketplaceListing',
        entityId: marketplace,
        action: 'update',
        before: { listings: before },
        after: { listings: dto.listings },
      });
    });
    return this.listings(marketplace);
  }
}
