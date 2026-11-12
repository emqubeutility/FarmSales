import { z } from 'zod';

// Singleton business profile — CLAUDE.md forbids inventing GSTIN/FSSAI/UPI details, so every
// field here is optional except the name; the server seeds a placeholder row and the owner fills
// in the rest in Settings.

// A UPI QR code: either a web address, or an image uploaded in Settings (stored as a data address,
// PNG, JPEG or WebP, at most about 300 KB before it was encoded).
export const QR_IMAGE_MAX_CHARS = 450_000;
const qrImagePattern = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/;
export const upiQrImageSchema = z
  .string()
  .max(QR_IMAGE_MAX_CHARS, 'The QR image is too large. Use an image under 300 KB.')
  .refine((value) => qrImagePattern.test(value) || /^https?:\/\/\S+$/.test(value), 'Upload a PNG, JPEG or WebP image, or give a web address');

export const updateBusinessProfileSchema = z.object({
  name: z.string().min(1),
  address: z.string().optional(),
  gstin: z.string().optional(),
  fssaiNumber: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().optional(),
  // An uploaded logo (a data address) or a web address; null removes it.
  logoUrl: upiQrImageSchema.nullable().optional(),
  upiId: z.string().optional(),
  // null removes the QR image.
  upiQrImageUrl: upiQrImageSchema.nullable().optional(),
  // Printed-bill options.
  showLogoOnBills: z.boolean().optional(),
  showGstinOnBills: z.boolean().optional(),
});

export type UpdateBusinessProfileDto = z.infer<typeof updateBusinessProfileSchema>;
