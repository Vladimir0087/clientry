import { randomInt } from 'node:crypto';

const VISITOR_HEADER = 'X-Forwarded-For';

// 198.18.0.0/15 is reserved for benchmarking (RFC 2544), so no real visitor shares an address.
function visitorAddress(): string {
  return `198.${String(randomInt(18, 20))}.${String(randomInt(0, 256))}.${String(randomInt(1, 255))}`;
}

export function visitorHeaders(): Record<string, string> {
  return { [VISITOR_HEADER]: visitorAddress() };
}
