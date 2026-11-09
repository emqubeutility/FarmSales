// One line for a delivery address, for screens and bills: "Flat 4, Sea View, Near park, Mumbai,
// Maharashtra, 400001". Empty parts are left out. Returns null when there is no address at all.
export interface AddressParts {
  deliveryAddress?: string | null;
  deliveryLandmark?: string | null;
  deliveryCity?: string | null;
  deliveryState?: string | null;
  deliveryPincode?: string | null;
}

// A landmark is typed as "Near park" or "park"; it is shown once, as "Near park".
function landmarkText(landmark?: string | null): string | null {
  const text = landmark?.trim();
  if (!text) return null;
  return /^near/i.test(text) ? text : `Near ${text}`;
}

export function formatAddress(parts: AddressParts): string | null {
  const line = [
    parts.deliveryAddress,
    landmarkText(parts.deliveryLandmark),
    parts.deliveryCity,
    parts.deliveryState,
    parts.deliveryPincode,
  ]
    .map((p) => p?.trim())
    .filter((p): p is string => !!p);
  return line.length > 0 ? line.join(", ") : null;
}
