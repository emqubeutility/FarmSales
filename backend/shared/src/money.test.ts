import { describe, expect, it } from 'vitest';
import {
  calcBillTotals,
  calcDeliveryCharge,
  calcDiscount,
  calcGross,
  DiscountExceedsMaxError,
  roundToRupee,
  splitCgstSgstFromTotal,
  splitTax,
} from './money.js';

describe('calcGross', () => {
  it('multiplies MRP by qty', () => {
    expect(calcGross(9000, 3)).toBe(27000); // 3 x Rs 90 pack
  });
});

describe('calcDiscount', () => {
  it('applies a percentage within the channel max', () => {
    expect(calcDiscount(10000, 5, 10)).toBe(500);
  });

  it('rejects a percentage above the channel max', () => {
    expect(() => calcDiscount(10000, 11, 10)).toThrow(DiscountExceedsMaxError);
  });
});

describe('splitTax', () => {
  it('extracts taxable value and splits tax evenly across CGST/SGST at 5%', () => {
    // net = 9450 paise at 5% -> taxable 9000, tax 450, cgst/sgst 225 each
    const split = splitTax(9450, 5);
    expect(split.taxablePaise).toBe(9000);
    expect(split.taxPaise).toBe(450);
    expect(split.cgstPaise).toBe(225);
    expect(split.sgstPaise).toBe(225);
  });
});

describe('splitCgstSgstFromTotal', () => {
  it('splits an even total equally', () => {
    expect(splitCgstSgstFromTotal(450)).toEqual({ cgstPaise: 225, sgstPaise: 225 });
  });

  it('gives the odd paisa to SGST', () => {
    expect(splitCgstSgstFromTotal(451)).toEqual({ cgstPaise: 226, sgstPaise: 225 });
  });
});

describe('roundToRupee', () => {
  it('rounds up to the nearest rupee', () => {
    expect(roundToRupee(9049)).toEqual({ totalPaise: 9000, roundOffPaise: -49 });
    expect(roundToRupee(9051)).toEqual({ totalPaise: 9100, roundOffPaise: 49 });
  });
});

describe('calcDeliveryCharge', () => {
  const zone = { feePaise: 4000, freeFromPaise: 50000 };

  it('charges the zone fee below the free-delivery minimum', () => {
    expect(calcDeliveryCharge(30000, zone)).toBe(4000);
  });

  it('is free at or above the minimum', () => {
    expect(calcDeliveryCharge(50000, zone)).toBe(0);
    expect(calcDeliveryCharge(60000, zone)).toBe(0);
  });
});

describe('calcBillTotals', () => {
  it('apportions a single discount pct across lines with different GST rates', () => {
    const totals = calcBillTotals(
      [
        { mrpPaise: 9000, qty: 1, taxRatePct: 5 },
        { mrpPaise: 78000, qty: 1, taxRatePct: 12 },
      ],
      10,
      10,
    );
    expect(totals.grossPaise).toBe(87000);
    expect(totals.discountPaise).toBe(8700);
    expect(totals.netPaise).toBe(78300);
    // taxable + tax should reconcile back to net (within rounding)
    expect(totals.taxablePaise + totals.taxPaise).toBe(totals.netPaise);
    expect(totals.cgstPaise + totals.sgstPaise).toBe(totals.taxPaise);
  });
});
