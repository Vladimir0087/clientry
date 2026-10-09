import { ApiError } from '@/shared/api/api-error';

const NOT_FOUND = 404;

export function isNotFound(error: unknown): boolean {
  return error instanceof ApiError && error.status === NOT_FOUND;
}
