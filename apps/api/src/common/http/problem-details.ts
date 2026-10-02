import { STATUS_CODES } from 'node:http';

// RFC 9457: a problem fully described by its status has type about:blank and the status phrase.
export const PROBLEM_TYPE = 'about:blank';
export const PROBLEM_MEDIA_TYPE = 'application/problem+json';

export function problemTitle(status: number): string {
  return STATUS_CODES[status] ?? 'Unknown Error';
}
