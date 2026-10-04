import { STATUS_CODES } from 'node:http';

// RFC 9457: a problem fully described by its status has type about:blank and the status phrase.
export const PROBLEM_TYPE = 'about:blank';
export const PROBLEM_MEDIA_TYPE = 'application/problem+json';

// Fixed text for 429: the rate limiter's own message names its class.
export const TOO_MANY_REQUESTS_DETAIL = 'Too many requests, try again later';

export function problemTitle(status: number): string {
  return STATUS_CODES[status] ?? 'Unknown Error';
}
