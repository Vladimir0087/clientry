import { z } from 'zod';

const EARLIEST = Date.UTC(2000, 0, 1);
const LATEST = Date.UTC(2100, 0, 1) - 1;

function isInRange(value: string): boolean {
  const time = Date.parse(value);
  return time >= EARLIEST && time <= LATEST;
}

// UTC only, in the stored toISOString() form, so equal instants compare equal as strings. A value
// that fails the format gets one message and never reaches the checks after it.
export function instantSchema(error?: string): z.ZodISODateTime {
  return z.iso
    .datetime({ abort: true, ...(error === undefined ? {} : { error }) })
    .overwrite((value) => new Date(value).toISOString())
    .refine(isInRange, 'Choose a date between 2000 and 2099');
}
