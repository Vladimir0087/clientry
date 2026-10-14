// The won chart covers the current month and the five before it.
export const PERIOD_MONTHS = 6;

// Month starts in the browser's zone, oldest first, through the start of the next month.
export function periodBounds(now: Date): string[] {
  const year = now.getFullYear();
  const month = now.getMonth();
  return Array.from({ length: PERIOD_MONTHS + 1 }, (_, index) =>
    new Date(year, month - PERIOD_MONTHS + 1 + index, 1).toISOString(),
  );
}
