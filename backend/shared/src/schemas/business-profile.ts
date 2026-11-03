import { z } from 'zod';

// Singleton business profile — CLAUDE.md forbids inventing GSTIN/FSSAI/UPI details, so every
// field here is optional except the name; the server seeds a placeholder row and the owner fills
// in the rest in Settings.
export const updateBusinessProfileSchema = z.object({
  name: z.string().min(1),
  address: z.string().optional(),
  gstin: z.string().optional(),
  fssaiNumber: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().optional(),
  logoUrl: z.string().optional(),
  upiId: z.string().optional(),
  upiQrImageUrl: z.string().optional(),
});

export type UpdateBusinessProfileDto = z.infer<typeof updateBusinessProfileSchema>;
