import { Body, Controller, Get, Param, Put, UseGuards } from '@nestjs/common';
import { marketplaceListingsSchema, marketplaceSchema } from '@farm-sales/shared';
import type { Marketplace, MarketplaceListingsDto } from '@farm-sales/shared';
import { AuthenticatedGuard } from '../auth/guards/authenticated.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { SafeUser } from '../auth/auth.service.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { MarketplacesService } from './marketplaces.service.js';

// Marketplace setup is owner-only, like the other Settings pages.
@Controller('marketplaces')
@UseGuards(AuthenticatedGuard, RolesGuard)
@Roles('OWNER')
export class MarketplacesController {
  constructor(private readonly marketplaces: MarketplacesService) {}

  @Get()
  statuses() {
    return this.marketplaces.statuses();
  }

  @Get(':marketplace/listings')
  listings(@Param('marketplace', new ZodValidationPipe(marketplaceSchema)) marketplace: Marketplace) {
    return this.marketplaces.listings(marketplace);
  }

  @Put(':marketplace/listings')
  setListings(
    @Param('marketplace', new ZodValidationPipe(marketplaceSchema)) marketplace: Marketplace,
    @Body(new ZodValidationPipe(marketplaceListingsSchema)) dto: MarketplaceListingsDto,
    @CurrentUser() user: SafeUser,
  ) {
    return this.marketplaces.setListings(marketplace, dto, user.id);
  }
}
