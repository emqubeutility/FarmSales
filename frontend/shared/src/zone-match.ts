// Matches a pincode against each zone's free-text `pincodes` field (e.g. "400001, 400002").
// Server-side only — a client never chooses the zone.

export interface ZoneForMatch {
  id: string;
  pincodes: string | null;
}

export function matchZoneForPincode(pincode: string, zones: ZoneForMatch[]): string | null {
  const target = pincode.trim();
  if (!target) return null;
  for (const zone of zones) {
    if (!zone.pincodes) continue;
    const codes = zone.pincodes.split(/[,\s]+/).map((c) => c.trim()).filter(Boolean);
    if (codes.includes(target)) return zone.id;
  }
  return null;
}
