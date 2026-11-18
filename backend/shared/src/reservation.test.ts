import { describe, expect, it } from 'vitest';
import { availableQty, checkTransfer, freeQty, holdCapacity, TransferError } from './reservation.js';

describe('freeQty and availableQty', () => {
  it('free stock is on hand minus every reservation', () => {
    expect(freeQty(50, 30)).toBe(20);
    expect(freeQty(10, 10)).toBe(0);
  });

  it('available is reserved minus held', () => {
    expect(availableQty(20, 5)).toBe(15);
  });

  it('keeps three decimals, like the database', () => {
    expect(freeQty(1.5, 0.2)).toBe(1.3);
  });
});

describe('holdCapacity', () => {
  it('lets a platform order take only its own available stock', () => {
    expect(holdCapacity('FLIPKART', 50, 0, 20, 5)).toBe(15);
  });

  it('lets a direct order take free stock, not a platform reservation', () => {
    expect(holdCapacity('DIRECT', 50, 30, 0, 0)).toBe(20);
    expect(holdCapacity('DIRECT', 50, 30, 30, 0)).toBe(20);
  });

  it('never returns a negative capacity', () => {
    expect(holdCapacity('AMAZON', 10, 0, 4, 6)).toBe(0);
    expect(holdCapacity('DIRECT', 10, 12, 0, 0)).toBe(0);
  });
});

describe('checkTransfer', () => {
  const stock = { onHand: 50, reserved: { FLIPKART: 20, AMAZON: 10 }, held: { FLIPKART: 5 } };

  it('moves free stock to a platform while free stock lasts', () => {
    expect(() => checkTransfer({ ...stock, from: 'FREE', to: 'SHOPIFY', qty: 20 })).not.toThrow();
    expect(() => checkTransfer({ ...stock, from: 'FREE', to: 'SHOPIFY', qty: 21 })).toThrow(TransferError);
  });

  it('moves only the available part of a platform reservation', () => {
    expect(() => checkTransfer({ ...stock, from: 'FLIPKART', to: 'AMAZON', qty: 15 })).not.toThrow();
    expect(() => checkTransfer({ ...stock, from: 'FLIPKART', to: 'AMAZON', qty: 16 })).toThrow(/Only 15 can move out of Flipkart/);
  });

  it('moves a platform reservation back to free stock', () => {
    expect(() => checkTransfer({ ...stock, from: 'AMAZON', to: 'FREE', qty: 10 })).not.toThrow();
  });

  it('does not count a direct reservation as free stock', () => {
    expect(() => checkTransfer({ onHand: 20, reserved: { FLIPKART: 5 }, reservedByDirect: 10, held: {}, from: 'FREE', to: 'AMAZON', qty: 6 })).toThrow(/Only 5 free/);
    expect(() => checkTransfer({ onHand: 20, reserved: { FLIPKART: 5 }, reservedByDirect: 10, held: {}, from: 'FREE', to: 'AMAZON', qty: 5 })).not.toThrow();
  });

  it('refuses a zero or negative quantity, and the same place twice', () => {
    expect(() => checkTransfer({ ...stock, from: 'FREE', to: 'SHOPIFY', qty: 0 })).toThrow(TransferError);
    expect(() => checkTransfer({ ...stock, from: 'AMAZON', to: 'AMAZON', qty: 1 })).toThrow(TransferError);
  });
});
