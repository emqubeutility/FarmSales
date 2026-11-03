import { describe, expect, it } from 'vitest';
import { matchZoneForPincode } from './zone-match.js';

const zones = [
  { id: 'z1', pincodes: '400001, 400002' },
  { id: 'z2', pincodes: '400003 400004' },
  { id: 'z3', pincodes: null },
];

describe('matchZoneForPincode', () => {
  it('matches a pincode listed with comma separators', () => {
    expect(matchZoneForPincode('400002', zones)).toBe('z1');
  });

  it('matches a pincode listed with whitespace separators', () => {
    expect(matchZoneForPincode('400004', zones)).toBe('z2');
  });

  it('trims surrounding whitespace on the input', () => {
    expect(matchZoneForPincode(' 400001 ', zones)).toBe('z1');
  });

  it('returns null when no zone covers the pincode', () => {
    expect(matchZoneForPincode('999999', zones)).toBeNull();
  });

  it('returns null for an empty pincode', () => {
    expect(matchZoneForPincode('', zones)).toBeNull();
  });

  it('skips zones with no pincodes configured', () => {
    expect(matchZoneForPincode('400001', [{ id: 'z3', pincodes: null }])).toBeNull();
  });
});
