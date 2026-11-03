// All amounts are integer paise. Never use float arithmetic for money.
// Reference calculation per HANDOVER.md section 6.

export class DiscountExceedsMaxError extends Error {
  constructor(public pct: number, public maxPct: number) {
    super(`Discount ${pct}% exceeds channel max ${maxPct}%`);
  }
}

export interface TaxSplit {
  taxablePaise: number;
  taxPaise: number;
  cgstPaise: number;
  sgstPaise: number;
}

export interface LineTotals {
  grossPaise: number;
  discountPaise: number;
  netPaise: number;
  taxablePaise: number;
  taxPaise: number;
  cgstPaise: number;
  sgstPaise: number;
}

export interface BillTotals {
  grossPaise: number;
  discountPaise: number;
  netPaise: number;
  taxablePaise: number;
  taxPaise: number;
  cgstPaise: number;
  sgstPaise: number;
  totalPaise: number;
  roundOffPaise: number;
}

export interface DeliveryZone {
  feePaise: number;
  freeFromPaise: number;
}

/** mrp * qty, rounded to the nearest paisa. */
export function calcGross(mrpPaise: number, qty: number): number {
  return Math.round(mrpPaise * qty);
}

/** discount = gross * pct / 100. Throws if pct exceeds the channel max; the server enforces this, never the client. */
export function calcDiscount(grossPaise: number, pct: number, maxPct: number): number {
  if (pct < 0 || pct > maxPct) {
    throw new DiscountExceedsMaxError(pct, maxPct);
  }
  return Math.round((grossPaise * pct) / 100);
}

/**
 * taxable = net / (1 + rate), tax = net - taxable, split half CGST half SGST.
 * `ratePct` is the combined GST rate (e.g. 5 for 2.5% CGST + 2.5% SGST).
 */
export function splitTax(netPaise: number, ratePct: number): TaxSplit {
  const taxablePaise = Math.round((netPaise * 100) / (100 + ratePct));
  const taxPaise = netPaise - taxablePaise;
  const cgstPaise = Math.round(taxPaise / 2);
  const sgstPaise = taxPaise - cgstPaise;
  return { taxablePaise, taxPaise, cgstPaise, sgstPaise };
}

/** Round to the nearest rupee (100 paise); returns the rounded total and the round-off amount. */
export function roundToRupee(netPaise: number): { totalPaise: number; roundOffPaise: number } {
  const totalPaise = Math.round(netPaise / 100) * 100;
  return { totalPaise, roundOffPaise: totalPaise - netPaise };
}

/** Zone fee is tax-inclusive; zero once the goods total reaches the zone's free-delivery minimum. Never negative. */
export function calcDeliveryCharge(goodsTotalPaise: number, zone: DeliveryZone): number {
  if (goodsTotalPaise >= zone.freeFromPaise) return 0;
  return Math.max(0, zone.feePaise);
}

/** Splits a bill's already-aggregated tax total evenly into CGST/SGST, for display on a bill/invoice. */
export function splitCgstSgstFromTotal(taxPaise: number): { cgstPaise: number; sgstPaise: number } {
  const cgstPaise = Math.round(taxPaise / 2);
  return { cgstPaise, sgstPaise: taxPaise - cgstPaise };
}

export interface BillLineInput {
  mrpPaise: number;
  qty: number;
  taxRatePct: number;
}

/**
 * Apportions a single bill-level discount percentage across lines that may carry different GST
 * rates, extracting tax per line after apportionment, per HANDOVER.md section 6.
 */
export function calcBillTotals(lines: BillLineInput[], discountPct: number, maxDiscountPct: number): BillTotals {
  const grossPaise = lines.reduce((sum, l) => sum + calcGross(l.mrpPaise, l.qty), 0);
  const discountPaise = calcDiscount(grossPaise, discountPct, maxDiscountPct);
  const netPaise = grossPaise - discountPaise;

  let taxablePaise = 0;
  let taxPaise = 0;
  let cgstPaise = 0;
  let sgstPaise = 0;
  let allocatedDiscount = 0;

  lines.forEach((line, i) => {
    const lineGross = calcGross(line.mrpPaise, line.qty);
    const isLast = i === lines.length - 1;
    const lineDiscount = isLast
      ? discountPaise - allocatedDiscount
      : grossPaise === 0
        ? 0
        : Math.round((lineGross * discountPaise) / grossPaise);
    allocatedDiscount += lineDiscount;
    const lineNet = lineGross - lineDiscount;
    const split = splitTax(lineNet, line.taxRatePct);
    taxablePaise += split.taxablePaise;
    taxPaise += split.taxPaise;
    cgstPaise += split.cgstPaise;
    sgstPaise += split.sgstPaise;
  });

  const { totalPaise, roundOffPaise } = roundToRupee(netPaise);

  return { grossPaise, discountPaise, netPaise, taxablePaise, taxPaise, cgstPaise, sgstPaise, totalPaise, roundOffPaise };
}
