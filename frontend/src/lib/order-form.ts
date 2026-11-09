import { createOrderSchema, type Channel } from "@farm-sales/shared";

// "Order from" choices for the Order Desk. Each one sets the sales channel (which drives the
// channel discount) and, for marketplaces, the customer name.
export type OrderSource =
  | "walk_in"
  | "phone"
  | "existing"
  | "flipkart"
  | "amazon"
  | "website"
  | "email"
  | "social";

export interface OrderSourceOption {
  value: OrderSource;
  label: string;
  channel: Channel;
  // Set for a marketplace: the customer name is fixed to it.
  marketplace?: string;
}

export const ORDER_SOURCES: OrderSourceOption[] = [
  { value: "walk_in", label: "Walk-in customer", channel: "WALK_IN" },
  { value: "phone", label: "Phone order", channel: "PHONE" },
  { value: "existing", label: "Existing customer", channel: "PHONE" },
  { value: "flipkart", label: "Flipkart", channel: "ONLINE", marketplace: "Flipkart" },
  { value: "amazon", label: "Amazon", channel: "ONLINE", marketplace: "Amazon" },
  { value: "website", label: "Website", channel: "ONLINE" },
  { value: "email", label: "Email", channel: "EMAIL" },
  { value: "social", label: "Social media", channel: "SOCIAL" },
];

export function sourceOption(source: OrderSource): OrderSourceOption {
  return ORDER_SOURCES.find((o) => o.value === source) ?? ORDER_SOURCES[0];
}

export type OrderPaymentPlan = "COD" | "UPI_ON_DELIVERY" | "PREPAID";

export interface OrderFormValues {
  source: OrderSource;
  customerId: string; // saved customer, for "Existing customer"
  customerName: string; // typed name, for every source except a saved customer or a marketplace
  customerPhone: string;
  delivery: boolean; // false = pickup, true = delivery to the address below
  zoneId: string; // delivery zone (its fee applies); "" when none chosen
  deliveryAddress: string; // address line: house or flat, street, area
  deliveryLandmark: string;
  deliveryCity: string;
  deliveryState: string;
  deliveryPincode: string;
  paymentPlan: OrderPaymentPlan;
  prepaidMode: "CASH" | "UPI";
  prepaidReference: string;
}

export const emptyOrderForm: OrderFormValues = {
  source: "phone",
  customerId: "",
  customerName: "",
  customerPhone: "",
  delivery: false,
  zoneId: "",
  deliveryAddress: "",
  deliveryLandmark: "",
  deliveryCity: "",
  deliveryState: "",
  deliveryPincode: "",
  paymentPlan: "COD",
  prepaidMode: "UPI",
  prepaidReference: "",
};

export type OrderFormKey = keyof OrderFormValues | "lines";
export type OrderFormErrors = Partial<Record<OrderFormKey, string>>;

// A phone number is needed for a phone order, for a saved customer, and for any delivery.
export function requiresPhone(values: OrderFormValues): boolean {
  return values.source === "phone" || values.source === "existing" || values.delivery;
}

// The order as the API receives it. Empty optional fields are left out. Address and zone are only
// sent for a delivery.
export function buildOrderBody(
  values: OrderFormValues,
  customers: { id: string; name: string }[],
  lines: { itemId: string; qty: number }[],
  discountPct: number,
  salesPoint: "WAREHOUSE_COUNTER" | "MARKET_STALL",
) {
  const option = sourceOption(values.source);
  const isPrepaid = values.paymentPlan === "PREPAID";
  const savedName = customers.find((c) => c.id === values.customerId)?.name ?? "";
  const customerName =
    option.marketplace ?? (values.source === "existing" ? savedName : values.customerName.trim());
  const phone = values.customerPhone.trim();
  const delivery = values.delivery;
  return {
    channel: option.channel,
    salesPoint,
    paymentPlan: values.paymentPlan,
    prepaidMode: isPrepaid ? values.prepaidMode : undefined,
    prepaidReference: isPrepaid ? values.prepaidReference.trim() || undefined : undefined,
    customerId: values.source === "existing" && values.customerId ? values.customerId : undefined,
    customerName,
    customerPhone: phone || undefined,
    deliveryAddress: delivery ? values.deliveryAddress.trim() || undefined : undefined,
    deliveryLandmark: delivery ? values.deliveryLandmark.trim() || undefined : undefined,
    deliveryCity: delivery ? values.deliveryCity.trim() || undefined : undefined,
    deliveryState: delivery ? values.deliveryState || undefined : undefined,
    deliveryPincode: delivery ? values.deliveryPincode.trim() || undefined : undefined,
    zoneId: delivery && values.zoneId ? values.zoneId : undefined,
    discountPct,
    lines: lines.map((line) => ({ itemId: line.itemId, qty: line.qty })),
  };
}

// Every problem with the form, keyed by field. The field rules come from the shared schema, so the
// web form and the API agree. The first message for a field wins.
export function orderErrors(values: OrderFormValues, body: ReturnType<typeof buildOrderBody>): OrderFormErrors {
  const errors: OrderFormErrors = {};

  if (values.source === "existing" && !values.customerId) {
    errors.customerId = "Choose the saved customer";
  }
  if (requiresPhone(values) && !values.customerPhone.trim()) {
    errors.customerPhone = values.delivery
      ? "Enter the mobile number for a delivery order"
      : "Enter the customer's mobile number";
  }
  if (values.delivery && !values.zoneId) {
    errors.zoneId = "Choose the delivery zone (it fills in from the pincode when a zone covers it)";
  }

  const result = createOrderSchema.safeParse(body);
  if (!result.success) {
    for (const issue of result.error.issues) {
      const key = String(issue.path[0] ?? "") as OrderFormKey;
      if (!key || key in errors) continue;
      // A saved customer's name is not typed, so its name error is not shown.
      if (key === "customerName" && values.source === "existing") continue;
      errors[key] = issue.message;
    }
  }
  return errors;
}
