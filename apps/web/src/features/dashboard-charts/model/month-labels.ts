const SHORT_MONTH = new Intl.DateTimeFormat('en-US', { month: 'short' });
const LONG_MONTH = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' });

// A period starts at a month start in the browser's zone, so the browser names it right.
export function shortMonth(start: string): string {
  return SHORT_MONTH.format(new Date(start));
}

export function longMonth(start: string): string {
  return LONG_MONTH.format(new Date(start));
}
