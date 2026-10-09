import { z } from 'zod';

export const clientSourceSchema = z.enum(['website', 'telegram', 'referral', 'other']);

export type ClientSource = z.infer<typeof clientSourceSchema>;
