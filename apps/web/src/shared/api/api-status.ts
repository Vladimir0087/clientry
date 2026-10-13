import { ApiError, UNEXPECTED_RESPONSE } from './api-error';

const FORBIDDEN = 403;
const NOT_FOUND = 404;
const SERVER_ERROR = 500;

// The API answers every server error with problem details; anything else came from the hosts.
export function isApiUnreachable(error: unknown): boolean {
  return (
    error instanceof ApiError && error.code === UNEXPECTED_RESPONSE && error.status >= SERVER_ERROR
  );
}

export function isNotFound(error: unknown): boolean {
  return error instanceof ApiError && error.status === NOT_FOUND;
}

export function isForbidden(error: unknown): boolean {
  return error instanceof ApiError && error.status === FORBIDDEN;
}

export function hasErrorCode(error: unknown, code: string): boolean {
  return error instanceof ApiError && error.code === code;
}

// The message of a 400 on one field, for a request whose form does not show that field.
export function fieldErrorMessage(error: unknown, path: string): string | undefined {
  return error instanceof ApiError
    ? error.errors.find((item) => item.path === path)?.message
    : undefined;
}
