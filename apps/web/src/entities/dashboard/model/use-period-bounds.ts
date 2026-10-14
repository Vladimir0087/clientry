'use client';

import { useMemo } from 'react';

import { useNow } from '@/shared/lib/use-now';

import { periodBounds } from './period-bounds';

// Null on the server and during hydration, which do not know the reader's zone. A new month gives
// new bounds, so the closed deals refetch.
export function usePeriodBounds(): readonly string[] | null {
  const now = useNow();
  const year = now?.getFullYear();
  const month = now?.getMonth();
  return useMemo(
    () => (year === undefined || month === undefined ? null : periodBounds(new Date(year, month))),
    [year, month],
  );
}
