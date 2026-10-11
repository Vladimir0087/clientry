import { z } from 'zod';

import { amountSchema } from '@clientry/shared/deals';

const MINOR_PER_MAJOR = 100;
const MINOR_DIGITS = 2;
// Longer whole parts are over the limit anyway, and Number stays exact below this.
const MAX_WHOLE_DIGITS = 12;
// Thousands grouped by commas or spaces, or plain digits; an optional sign and fraction.
const AMOUNT_PATTERN = /^(-?)(\d{1,3}(?:[, ]\d{3})+|\d+)(?:\.(\d+))?$/;
// A decimal comma, as some keyboards offer instead of a point: 1–2 digits after it, as three
// digits after a comma are thousands.
const COMMA_DECIMAL_PATTERN = /^(-?)(\d{1,3}(?: \d{3})+|\d+),(\d{1,2})$/;
const SEPARATORS = /[, ]/g;
// Copied ru, pl or fr amounts group thousands by a no-break or a narrow no-break space.
const NO_BREAK_SPACES = /[\u00A0\u202F]/g;

const FORMAT_MESSAGE = 'Enter an amount like 1500 or 1500.50';
const TOO_BIG_MESSAGE = 'Use an amount up to 1,000,000,000';

type AmountParse =
  | { readonly isValid: true; readonly minor: number }
  | { readonly isValid: false; readonly message: string };

// "1,500.50" is 150050 minor units; the string is split, never parsed as a float.
function parseAmount(text: string): AmountParse {
  const trimmed = text.trim().replace(NO_BREAK_SPACES, ' ');
  if (trimmed === '') {
    return { isValid: false, message: 'Enter an amount' };
  }
  const match = COMMA_DECIMAL_PATTERN.exec(trimmed) ?? AMOUNT_PATTERN.exec(trimmed);
  if (match === null) {
    return { isValid: false, message: FORMAT_MESSAGE };
  }
  const [, sign = '', whole = '', fraction = ''] = match;
  if (fraction.length > MINOR_DIGITS) {
    return { isValid: false, message: 'Use at most two decimal places' };
  }
  const digits = whole.replace(SEPARATORS, '');
  if (digits.length > MAX_WHOLE_DIGITS) {
    return { isValid: false, message: TOO_BIG_MESSAGE };
  }
  const minor = Number(digits) * MINOR_PER_MAJOR + Number(fraction.padEnd(MINOR_DIGITS, '0'));
  return { isValid: true, minor: sign === '-' ? -minor : minor };
}

// The shared amount rules still apply after parsing: not negative, at most one billion.
export const amountInputSchema = z
  .string()
  .transform((text, context) => {
    const parsed = parseAmount(text);
    if (!parsed.isValid) {
      context.addIssue({ code: 'custom', message: parsed.message });
      return z.NEVER;
    }
    return parsed.minor;
  })
  .pipe(amountSchema);

// The stored amount as the field shows it: 150050 is "1500.50", 150000 is "1500".
export function formatAmountInput(minor: number): string {
  const whole = Math.trunc(minor / MINOR_PER_MAJOR);
  const cents = minor % MINOR_PER_MAJOR;
  return cents === 0
    ? String(whole)
    : `${String(whole)}.${String(cents).padStart(MINOR_DIGITS, '0')}`;
}
