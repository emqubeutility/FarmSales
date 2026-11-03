import { z } from 'zod';

export const channelSchema = z.enum(['WALK_IN', 'PHONE', 'ONLINE', 'EMAIL', 'SOCIAL']);

export const setChannelDiscountSchema = z.object({
  channel: channelSchema,
  defaultPct: z.number().min(0).max(100),
  maxPct: z.number().min(0).max(100),
});

export type Channel = z.infer<typeof channelSchema>;
export type SetChannelDiscountDto = z.infer<typeof setChannelDiscountSchema>;
