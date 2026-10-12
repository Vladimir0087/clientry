import type { Query } from '@tanstack/react-query';

// For cancelling before an optimistic write: a first load cancelled would stay pending with
// nothing to fetch it again, and it holds nothing the write could lose.
export function hasQueryData(query: Query): boolean {
  return query.state.data !== undefined;
}
