import type { ReactNode } from "react";
import { INDIAN_STATES, matchZoneForPincode } from "@farm-sales/shared";
import {
  ORDER_SOURCES,
  requiresPhone,
  sourceOption,
  type OrderFormErrors,
  type OrderFormKey,
  type OrderFormValues,
  type OrderPaymentPlan,
  type OrderSource,
} from "../lib/order-form.js";

interface ZoneChoice {
  id: string;
  name: string;
  pincodes: string | null;
}

interface OrderFormProps {
  values: OrderFormValues;
  customers: { id: string; name: string }[];
  zones: ZoneChoice[];
  // Errors to show now. The page decides which ones (after a field is left, or on submit).
  errors: OrderFormErrors;
  onChange: <K extends keyof OrderFormValues>(key: K, value: OrderFormValues[K]) => void;
  onSourceChange: (source: OrderSource) => void;
  onBlur: (key: OrderFormKey) => void;
}

const errorColor = "#B42318";

// The order details form. It only shows and reports; the page holds the values and the errors.
export function OrderForm({ values, customers, zones, errors, onChange, onSourceChange, onBlur }: OrderFormProps) {
  const option = sourceOption(values.source);
  const phoneRequired = requiresPhone(values);
  const isDelivery = values.delivery;
  const matchedZone = values.deliveryPincode.length === 6 ? matchZoneForPincode(values.deliveryPincode, zones) : null;
  const matchedZoneName = zones.find((z) => z.id === matchedZone)?.name ?? null;

  // A full pincode picks the zone that covers it. The zone can still be changed by hand.
  function changePincode(raw: string) {
    const pincode = raw.replace(/\D/g, "").slice(0, 6);
    onChange("deliveryPincode", pincode);
    if (pincode.length === 6) {
      const zoneId = matchZoneForPincode(pincode, zones);
      if (zoneId) onChange("zoneId", zoneId);
    }
  }

  return (
    <div
      className="card order-create-fields"
      style={{ padding: 14, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}
    >
      <style>{`
        .order-create-fields [aria-invalid="true"] {
          border-color: ${errorColor};
          box-shadow: 0 0 0 1px ${errorColor};
        }
      `}</style>

      <Field label="Order from" required>
        <select className="in" value={values.source} onChange={(e) => onSourceChange(e.target.value as OrderSource)}>
          {ORDER_SOURCES.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </Field>

      {values.source === "existing" ? (
        <Field label="Saved customer" required error={errors.customerId}>
          <select
            className="in"
            value={values.customerId}
            aria-invalid={!!errors.customerId}
            onChange={(e) => onChange("customerId", e.target.value)}
            onBlur={() => onBlur("customerId")}
          >
            <option value="">{customers.length ? "Choose a customer" : "No saved customers yet"}</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
      ) : option.marketplace ? (
        <Field label="Customer">
          <input className="in" value={option.marketplace} disabled />
        </Field>
      ) : (
        <Field label="Customer name" required error={errors.customerName}>
          <input
            className="in"
            value={values.customerName}
            maxLength={60}
            placeholder="Full name"
            autoComplete="off"
            aria-invalid={!!errors.customerName}
            onChange={(e) => onChange("customerName", e.target.value)}
            onBlur={() => onBlur("customerName")}
          />
        </Field>
      )}

      <Field
        label="Mobile number"
        required={phoneRequired}
        error={errors.customerPhone}
        hint={phoneRequired ? "Needed for phone orders and deliveries" : "Optional"}
      >
        <input
          className="in"
          inputMode="numeric"
          autoComplete="off"
          placeholder="10-digit mobile"
          value={values.customerPhone}
          aria-invalid={!!errors.customerPhone}
          onChange={(e) => onChange("customerPhone", e.target.value.replace(/\D/g, "").slice(0, 10))}
          onBlur={() => onBlur("customerPhone")}
        />
      </Field>

      <Field label="Payment plan" required error={errors.paymentPlan}>
        <select
          className="in"
          value={values.paymentPlan}
          onChange={(e) => onChange("paymentPlan", e.target.value as OrderPaymentPlan)}
        >
          <option value="COD">Cash on delivery</option>
          <option value="UPI_ON_DELIVERY">UPI on delivery</option>
          <option value="PREPAID">Prepaid</option>
        </select>
      </Field>

      <Field label="Fulfilment" required>
        <div style={{ display: "flex", gap: 6 }}>
          {(
            [
              { value: false, label: "Pickup" },
              { value: true, label: "Delivery" },
            ] as const
          ).map((choice) => (
            <button
              key={choice.label}
              type="button"
              className={values.delivery === choice.value ? "btn p" : "btn"}
              aria-pressed={values.delivery === choice.value}
              style={{ flex: 1, minHeight: 44 }}
              onClick={() => onChange("delivery", choice.value)}
            >
              {choice.label}
            </button>
          ))}
        </div>
      </Field>

      {isDelivery && (
        <>
          <Field
            label="Delivery zone"
            required
            error={errors.zoneId}
            hint={matchedZoneName ? `Filled from the pincode: ${matchedZoneName}` : "Picked from the pincode when a zone covers it"}
          >
            <select
              className="in"
              value={values.zoneId}
              aria-invalid={!!errors.zoneId}
              onChange={(e) => onChange("zoneId", e.target.value)}
            >
              <option value="">Choose a zone</option>
              {zones.map((z) => (
                <option key={z.id} value={z.id}>
                  {z.name}
                </option>
              ))}
            </select>
          </Field>

          <div style={{ gridColumn: "1 / -1" }}>
            <Field label="Address line" required error={errors.deliveryAddress}>
              <input
                className="in"
                value={values.deliveryAddress}
                maxLength={200}
                placeholder="House or flat no., building, street, area"
                autoComplete="off"
                aria-invalid={!!errors.deliveryAddress}
                onChange={(e) => onChange("deliveryAddress", e.target.value)}
                onBlur={() => onBlur("deliveryAddress")}
              />
            </Field>
          </div>

          <Field label="Landmark" error={errors.deliveryLandmark} hint="Optional">
            <input
              className="in"
              value={values.deliveryLandmark}
              maxLength={100}
              placeholder="Near ..."
              autoComplete="off"
              aria-invalid={!!errors.deliveryLandmark}
              onChange={(e) => onChange("deliveryLandmark", e.target.value)}
              onBlur={() => onBlur("deliveryLandmark")}
            />
          </Field>

          <Field label="City" required error={errors.deliveryCity}>
            <input
              className="in"
              value={values.deliveryCity}
              maxLength={60}
              placeholder="City"
              autoComplete="off"
              aria-invalid={!!errors.deliveryCity}
              onChange={(e) => onChange("deliveryCity", e.target.value)}
              onBlur={() => onBlur("deliveryCity")}
            />
          </Field>

          <Field label="State" required error={errors.deliveryState}>
            <select
              className="in"
              value={values.deliveryState}
              aria-invalid={!!errors.deliveryState}
              onChange={(e) => onChange("deliveryState", e.target.value)}
              onBlur={() => onBlur("deliveryState")}
            >
              <option value="">Choose a state</option>
              {INDIAN_STATES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Pincode" required error={errors.deliveryPincode}>
            <input
              className="in"
              inputMode="numeric"
              autoComplete="off"
              placeholder="6-digit pincode"
              value={values.deliveryPincode}
              aria-invalid={!!errors.deliveryPincode}
              onChange={(e) => changePincode(e.target.value)}
              onBlur={() => onBlur("deliveryPincode")}
            />
          </Field>
        </>
      )}

      {values.paymentPlan === "PREPAID" && (
        <>
          <Field label="Prepaid via" required error={errors.prepaidMode}>
            <select
              className="in"
              value={values.prepaidMode}
              onChange={(e) => onChange("prepaidMode", e.target.value as "CASH" | "UPI")}
            >
              <option value="UPI">UPI</option>
              <option value="CASH">Cash</option>
            </select>
          </Field>
          <Field
            label={values.prepaidMode === "UPI" ? "UPI reference (UTR)" : "Reference"}
            required={values.prepaidMode === "UPI"}
            error={errors.prepaidReference}
          >
            <input
              className="in"
              value={values.prepaidReference}
              maxLength={60}
              autoComplete="off"
              aria-invalid={!!errors.prepaidReference}
              onChange={(e) => onChange("prepaidReference", e.target.value)}
              onBlur={() => onBlur("prepaidReference")}
            />
          </Field>
        </>
      )}
    </div>
  );
}

function Field({
  label,
  required,
  hint,
  error,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
      <div className="lbl">
        {label}
        {required && <span style={{ color: errorColor }}> *</span>}
      </div>
      {children}
      {error ? (
        <div role="alert" style={{ color: errorColor, fontSize: 12.5 }}>
          {error}
        </div>
      ) : hint ? (
        <div className="muted" style={{ fontSize: 12 }}>
          {hint}
        </div>
      ) : null}
    </div>
  );
}
