import { describe, expect, it } from 'vitest';
import { marketplaceListingsSchema, marketplaceSchema } from './marketplace.js';

const itemA = '6f1c2b1e-0000-4000-8000-000000000001';
const itemB = '6f1c2b1e-0000-4000-8000-000000000002';

describe('marketplaceSchema', () => {
  it('accepts the marketplaces we list on', () => {
    expect(marketplaceSchema.safeParse('FLIPKART').success).toBe(true);
    expect(marketplaceSchema.safeParse('AMAZON').success).toBe(true);
  });

  it('rejects anything else', () => {
    expect(marketplaceSchema.safeParse('MEESHO').success).toBe(false);
  });
});

describe('marketplaceListingsSchema', () => {
  it('accepts a list of items with their marketplace SKUs, and an empty list', () => {
    expect(marketplaceListingsSchema.safeParse({ listings: [{ itemId: itemA, marketplaceSku: 'RF500' }] }).success).toBe(true);
    expect(marketplaceListingsSchema.safeParse({ listings: [] }).success).toBe(true);
  });

  it('trims the SKU and rejects a blank one', () => {
    const trimmed = marketplaceListingsSchema.parse({ listings: [{ itemId: itemA, marketplaceSku: '  RF500  ' }] });
    expect(trimmed.listings[0].marketplaceSku).toBe('RF500');
    expect(marketplaceListingsSchema.safeParse({ listings: [{ itemId: itemA, marketplaceSku: '   ' }] }).success).toBe(false);
  });

  it('rejects an item listed twice', () => {
    const result = marketplaceListingsSchema.safeParse({
      listings: [
        { itemId: itemA, marketplaceSku: 'RF500' },
        { itemId: itemA, marketplaceSku: 'RF500-B' },
      ],
    });
    expect(result.success).toBe(false);
  });

  it('rejects one SKU used for two items', () => {
    const result = marketplaceListingsSchema.safeParse({
      listings: [
        { itemId: itemA, marketplaceSku: 'RF500' },
        { itemId: itemB, marketplaceSku: 'RF500' },
      ],
    });
    expect(result.success).toBe(false);
  });
});
