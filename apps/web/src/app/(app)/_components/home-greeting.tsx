'use client';

import type { UseQueryResult } from '@tanstack/react-query';
import { useId } from 'react';
import type * as React from 'react';

import { useSession } from '@/entities/session';
import { roleLabel } from '@/shared/lib/role-label';
import { RetryFocusBox } from '@/shared/ui/retry-focus-box';
import { RetryMessage } from '@/shared/ui/retry-message';
import type { SessionResponse } from '@clientry/shared/auth';

import { GreetingSkeleton } from './greeting-skeleton';

interface GreetingStateProps {
  readonly session: UseQueryResult<SessionResponse>;
  readonly focusTargetId: string;
}

function GreetingState({ session, focusTargetId }: GreetingStateProps): React.JSX.Element {
  if (session.data !== undefined) {
    const { user, workspace, role } = session.data;
    return (
      <div className="flex flex-col gap-1">
        <h1 tabIndex={-1} className="text-2xl font-semibold tracking-tight outline-none">
          Welcome, {user.name}
        </h1>
        <p className="text-muted-foreground">
          {workspace.name} · {roleLabel(role)}
        </p>
      </div>
    );
  }
  if (session.isPending) {
    return <GreetingSkeleton />;
  }
  const handleRetry = (): void => {
    void session.refetch();
  };
  return (
    <RetryMessage
      message="We could not load your account."
      focusTargetId={focusTargetId}
      onRetry={handleRetry}
    />
  );
}

export function HomeGreeting(): React.JSX.Element {
  const stateId = useId();
  const session = useSession();
  return (
    <RetryFocusBox id={stateId} hasLoaded={session.data !== undefined}>
      <GreetingState session={session} focusTargetId={stateId} />
    </RetryFocusBox>
  );
}
