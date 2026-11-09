import { z } from 'zod';

// States and union territories of India, as used for a delivery address.
export const INDIAN_STATES = [
  'Andaman and Nicobar Islands',
  'Andhra Pradesh',
  'Arunachal Pradesh',
  'Assam',
  'Bihar',
  'Chandigarh',
  'Chhattisgarh',
  'Dadra and Nagar Haveli and Daman and Diu',
  'Delhi',
  'Goa',
  'Gujarat',
  'Haryana',
  'Himachal Pradesh',
  'Jammu and Kashmir',
  'Jharkhand',
  'Karnataka',
  'Kerala',
  'Ladakh',
  'Lakshadweep',
  'Madhya Pradesh',
  'Maharashtra',
  'Manipur',
  'Meghalaya',
  'Mizoram',
  'Nagaland',
  'Odisha',
  'Puducherry',
  'Punjab',
  'Rajasthan',
  'Sikkim',
  'Tamil Nadu',
  'Telangana',
  'Tripura',
  'Uttar Pradesh',
  'Uttarakhand',
  'West Bengal',
] as const;

// An Indian postal PIN code: six digits, first digit 1 to 9.
export const pincodeSchema = z
  .string()
  .trim()
  .regex(/^[1-9]\d{5}$/, 'Enter a valid 6-digit pincode');

export const citySchema = z
  .string()
  .trim()
  .min(2, 'Enter the city')
  .max(60, 'City can be 60 characters at most')
  .regex(/^[\p{L}\p{M} .'-]+$/u, "Use letters, spaces and . ' - only");

export const stateSchema = z
  .string()
  .refine((value) => (INDIAN_STATES as readonly string[]).includes(value), 'Choose the state from the list');

export const landmarkSchema = z.string().trim().max(100, 'Landmark can be 100 characters at most');
