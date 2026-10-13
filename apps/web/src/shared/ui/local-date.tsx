'use client';

import { useSyncExternalStore } from 'react';
import type * as React from 'react';

import { DATE_FORMAT, DATE_TIME_FORMAT } from '@/shared/lib/local-date-time';

function subscribe(): () => void {
  return () => undefined;
}

interface LocalDateProps {
  readonly value: string;
  readonly hasTime?: boolean;
}

// The server runs in UTC, so a date near midnight would differ from the browser's; it renders the
// text only after hydration, in the browser's time zone.
export function LocalDate({ value, hasTime = false }: LocalDateProps): React.JSX.Element {
  const isHydrated = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
  const format = hasTime ? DATE_TIME_FORMAT : DATE_FORMAT;
  return <time dateTime={value}>{isHydrated ? format.format(new Date(value)) : null}</time>;
}
