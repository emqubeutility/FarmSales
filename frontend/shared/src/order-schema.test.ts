import { describe, expect, it } from 'vitest';
import { createOrderSchema } from './schemas/order.js';

const ITEM_ID = '6f1c3a52-8b1e-4c7a-9d2e-1a2b3c4d5e6f';
const ZONE_ID = '0a9b8c7d-6e5f-4a3b-8c2d-1e0f9a8b7c6d';

function base(overrides: Record<string, unknown> = {}) {
  return {
    channel: 'PHONE',
    salesPoint: 'WAREHOUSE_COUNTER',
    paymentPlan: 'COD',
    customerName: 'Ravi Kumar',
    discountPct: 0,
    lines: [{ itemId: ITEM_ID, qty: 1 }],
    ...overrides,
  };
}

// The first message for a given field, or undefined when that field passes.
function fieldError(input: Record<string, unknown>, field: string): string | undefined {
  const result = createOrderSchema.safeParse(input);
  if (result.success) return undefined;
  return result.error.issues.find((issue) => issue.path[0] === field)?.message;
}

describe('createOrderSchema', () => {
  it('accepts a complete phone order', () => {
    expect(createOrderSchema.safeParse(base({ customerPhone: '9876543210' })).success).toBe(true);
  });

  it('requires a customer name of at least 2 characters', () => {
    expect(fieldError(base({ customerName: '' }), 'customerName')).toMatch(/customer name/i);
    expect(fieldError(base({ customerName: '   ' }), 'customerName')).toMatch(/customer name/i);
  });

  it('rejects digits and symbols in the customer name', () => {
    expect(fieldError(base({ customerName: 'R2D2!' }), 'customerName')).toMatch(/letters/i);
  });

  it('accepts Flipkart and Amazon as names', () => {
    expect(fieldError(base({ customerName: 'Flipkart', channel: 'ONLINE' }), 'customerName')).toBeUndefined();
    expect(fieldError(base({ customerName: 'Amazon', channel: 'ONLINE' }), 'customerName')).toBeUndefined();
  });

  it('accepts only a 10-digit mobile starting with 6 to 9', () => {
    expect(fieldError(base({ customerPhone: '12345' }), 'customerPhone')).toMatch(/10-digit/);
    expect(fieldError(base({ customerPhone: '5876543210' }), 'customerPhone')).toMatch(/10-digit/);
    expect(fieldError(base({ customerPhone: '9876543210' }), 'customerPhone')).toBeUndefined();
  });

  it('needs a delivery address when a zone is chosen', () => {
    expect(fieldError(base({ zoneId: ZONE_ID, customerPhone: '9876543210' }), 'deliveryAddress')).toMatch(/address/i);
    expect(
      fieldError(base({ zoneId: ZONE_ID, customerPhone: '9876543210', deliveryAddress: 'Flat 4, Dadar West' }), 'deliveryAddress'),
    ).toBeUndefined();
  });

  it('needs a mobile number for a delivery order', () => {
    expect(fieldError(base({ zoneId: ZONE_ID, deliveryAddress: 'Flat 4, Dadar West' }), 'customerPhone')).toMatch(/mobile/i);
  });

  it('needs the UPI reference for a UPI prepaid order', () => {
    const upi = base({ paymentPlan: 'PREPAID', prepaidMode: 'UPI' });
    expect(fieldError(upi, 'prepaidReference')).toMatch(/UTR/);
    expect(fieldError({ ...upi, prepaidReference: '412345678901' }, 'prepaidReference')).toBeUndefined();
  });

  it('does not need a reference for a cash prepaid order', () => {
    expect(createOrderSchema.safeParse(base({ paymentPlan: 'PREPAID', prepaidMode: 'CASH' })).success).toBe(true);
  });

  it('needs at least one item', () => {
    expect(fieldError(base({ lines: [] }), 'lines')).toMatch(/at least one item/i);
  });

  it('rejects a negative discount', () => {
    expect(createOrderSchema.safeParse(base({ discountPct: -1 })).success).toBe(false);
  });
});

describe('delivery address fields', () => {
  const delivery = {
    zoneId: ZONE_ID,
    customerPhone: '9876543210',
    deliveryAddress: 'Flat 4, Sea View, Dadar West',
    deliveryCity: 'Mumbai',
    deliveryState: 'Maharashtra',
    deliveryPincode: '400028',
  };

  it('accepts a complete delivery address', () => {
    expect(createOrderSchema.safeParse(base(delivery)).success).toBe(true);
  });

  it('needs a city, state and pincode for a delivery', () => {
    expect(fieldError(base({ ...delivery, deliveryCity: undefined }), 'deliveryCity')).toMatch(/city/i);
    expect(fieldError(base({ ...delivery, deliveryState: undefined }), 'deliveryState')).toMatch(/state/i);
    expect(fieldError(base({ ...delivery, deliveryPincode: undefined }), 'deliveryPincode')).toMatch(/pincode/i);
  });

  it('accepts only a 6-digit pincode that does not start with 0', () => {
    expect(fieldError(base({ ...delivery, deliveryPincode: '40002' }), 'deliveryPincode')).toMatch(/6-digit/);
    expect(fieldError(base({ ...delivery, deliveryPincode: '012345' }), 'deliveryPincode')).toMatch(/6-digit/);
    expect(fieldError(base({ ...delivery, deliveryPincode: '400028' }), 'deliveryPincode')).toBeUndefined();
  });

  it('accepts only a state from the list', () => {
    expect(fieldError(base({ ...delivery, deliveryState: 'Narnia' }), 'deliveryState')).toMatch(/list/i);
  });
});
