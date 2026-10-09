'use client';

import { useSyncExternalStore } from 'react';
import type * as React from 'react';

const DATE_FORMAT = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' });

function subscribe(): () => void {
  return () => undefined;
}

// The server runs in UTC, so a date near midnight would differ from the browser's; it renders the
// text only after hydration, in the browser's time zone.
export function LocalDate({ value }: { readonly value: string }): React.JSX.Element {
  const isHydrated = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
  return <time dateTime={value}>{isHydrated ? DATE_FORMAT.format(new Date(value)) : null}</time>;
}
