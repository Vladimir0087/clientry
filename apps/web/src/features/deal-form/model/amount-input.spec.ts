import { describe, expect, it } from 'vitest';

import { amountInputSchema, formatAmountInput } from './amount-input';

function messageFor(text: string): string | undefined {
  const result = amountInputSchema.safeParse(text);
  return result.success ? undefined : result.error.issues[0]?.message;
}

describe('amountInputSchema', () => {
  it.each([
    ['1500', 150000],
    ['1,500.50', 150050],
    ['1 500.5', 150050],
    [' 0 ', 0],
    ['1,000,000,000', 100_000_000_000],
    ['1500,50', 150050],
    ['1 500,5', 150050],
    ['1,50', 150],
    ['1\u00A0500,50', 150050],
    ['1\u202F500', 150000],
    // Times 100 in floating point, 0.29 and 19.99 are not whole numbers.
    ['0.29', 29],
    ['19.99', 1999],
    ['1,000,000,000.00', 100_000_000_000],
  ])('should give $1 minor units when the input is %j', (text, minor) => {
    expect(amountInputSchema.parse(text)).toBe(minor);
  });

  it.each([
    ['', 'Enter an amount'],
    ['abc', 'Enter an amount like 1500 or 1500.50'],
    ['1,500,50', 'Enter an amount like 1500 or 1500.50'],
    ['1.234', 'Use at most two decimal places'],
    ['-1', 'Amount cannot be negative'],
    ['1000000000.01', 'Use an amount up to 1,000,000,000'],
    ['99999999999999999999', 'Use an amount up to 1,000,000,000'],
  ])('should reject with its message when the input is %j', (text, message) => {
    expect(messageFor(text)).toBe(message);
  });
});

describe('formatAmountInput', () => {
  it('should show two decimals without separators when the amount has cents', () => {
    expect(formatAmountInput(150050)).toBe('1500.50');
  });

  it('should show the whole number when the amount has no cents', () => {
    expect(formatAmountInput(150000)).toBe('1500');
  });
});
