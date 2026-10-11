import { ApiError } from './api-error';

const FORBIDDEN = 403;
const NOT_FOUND = 404;

export function isNotFound(error: unknown): boolean {
  return error instanceof ApiError && error.status === NOT_FOUND;
}

export function isForbidden(error: unknown): boolean {
  return error instanceof ApiError && error.status === FORBIDDEN;
}

export function hasErrorCode(error: unknown, code: string): boolean {
  return error instanceof ApiError && error.code === code;
}
