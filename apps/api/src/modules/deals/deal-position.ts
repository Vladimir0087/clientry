import { generateKeyBetween, generateNKeysBetween } from 'fractional-indexing';

// Library defaults only, so a seed or a script calling the library can extend any column. It throws
// on equal keys, so the upper neighbour is always the first key strictly greater than the lower.
export function positionBetween(before: string | null, after: string | null): string {
  return generateKeyBetween(before, after);
}

export function positionsAfter(last: string | null, count: number): string[] {
  return generateNKeysBetween(last, null, count);
}
