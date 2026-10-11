import { z } from 'zod';

// Every code here has two minor digits; one with another exponent needs an exponent table first.
export const CURRENCIES = ['USD', 'EUR', 'PLN', 'BYN', 'RUB'] as const;

export const currencySchema = z.enum(CURRENCIES, { error: 'Choose a currency' });

export type Currency = z.infer<typeof currencySchema>;
