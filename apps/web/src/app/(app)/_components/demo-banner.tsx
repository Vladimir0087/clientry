'use client';

import type * as React from 'react';

import { useSession } from '@/entities/session';
import type { MemberRole } from '@clientry/shared/auth';

const ROLE_PHRASES: Readonly<Record<MemberRole, string>> = {
  owner: 'the owner',
  manager: 'a manager',
};

// Read from the session the layout prefetched, so it is in the server HTML; a plain paragraph,
// met once per page and never focused.
export function DemoBanner(): React.JSX.Element | null {
  const session = useSession();
  if (session.data?.workspace.isDemo !== true) {
    return null;
  }
  const { user, role } = session.data;
  return (
    <p className="border-b bg-muted px-4 py-2 text-center text-xs sm:text-sm">
      You are in a shared demo as {user.name}, {ROLE_PHRASES[role]}. Other visitors see your
      changes, and the data resets every day.
    </p>
  );
}
