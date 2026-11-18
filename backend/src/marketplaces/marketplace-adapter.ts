import type { Marketplace, MarketplaceConnectionState } from '@farm-sales/shared';

// One adapter per marketplace. For now it only reports whether the server has keys. Order import
// and stock push are added once the marketplace's API access is granted; they make no calls yet.
export interface MarketplaceAdapter {
  readonly marketplace: Marketplace;
  connectionState(): MarketplaceConnectionState;
}
