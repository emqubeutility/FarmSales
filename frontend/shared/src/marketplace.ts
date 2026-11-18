import { z } from 'zod';

// Online marketplaces we list items on. Connection keys are server config, never sent to the app.
export const MARKETPLACES = ['FLIPKART', 'AMAZON'] as const;
export type Marketplace = (typeof MARKETPLACES)[number];
export const marketplaceSchema = z.enum(MARKETPLACES);

export const MARKETPLACE_LABELS: Record<Marketplace, string> = {
  FLIPKART: 'Flipkart',
  AMAZON: 'Amazon',
};

// 'NOT_STARTED': no integration built yet. 'NOT_CONFIGURED': built, but keys are missing on the server.
// 'CONFIGURED': keys are present. No connection test is made yet.
export type MarketplaceConnectionState = 'NOT_STARTED' | 'NOT_CONFIGURED' | 'CONFIGURED';
export interface MarketplaceStatus {
  marketplace: Marketplace;
  label: string;
  state: MarketplaceConnectionState;
}

// The seller SKU a marketplace knows an item by. The marketplace's own rules are not known yet, so
// only blank and length are checked here; tighten this when the API rules are confirmed.
export const marketplaceSkuSchema = z.string().trim().min(1, 'Enter a SKU, or leave the item unlisted').max(100);

// Replaces the full listing set for one marketplace. An item is listed when it appears here.
export const marketplaceListingsSchema = z
  .object({
    listings: z.array(z.object({ itemId: z.string().min(1), marketplaceSku: marketplaceSkuSchema })).max(2000),
  })
  .superRefine((dto, ctx) => {
    const itemIds = new Set<string>();
    const skus = new Set<string>();
    dto.listings.forEach((row, index) => {
      if (itemIds.has(row.itemId)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['listings', index, 'itemId'], message: 'This item is listed twice' });
      }
      itemIds.add(row.itemId);
      if (skus.has(row.marketplaceSku)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['listings', index, 'marketplaceSku'], message: 'This SKU is used for another item' });
      }
      skus.add(row.marketplaceSku);
    });
  });
export type MarketplaceListingsDto = z.infer<typeof marketplaceListingsSchema>;
