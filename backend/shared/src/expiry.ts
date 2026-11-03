// Expiry rule for stock. A batch is expired when its best-before date is before today, so the
// best-before day itself is still sellable. Compared by calendar day, so a time of day on the
// date never changes the answer. Expired stock is never allocated to a sale or an order.

function localDay(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** True when `bestBefore` is set and its calendar day is before the calendar day of `now`. */
export function isExpired(bestBefore: Date | string | null | undefined, now: Date = new Date()): boolean {
  if (!bestBefore) return false; // packaging and other non-expiry items never expire
  return localDay(new Date(bestBefore)) < localDay(now);
}
