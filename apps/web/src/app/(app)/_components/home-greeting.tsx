'use client';

import type * as React from 'react';

import { roleLabel, useSession } from '@/entities/session';
import { Button } from '@/shared/ui/button';

import { GreetingSkeleton } from './greeting-skeleton';

export function HomeGreeting(): React.JSX.Element {
  const session = useSession();
  if (session.data !== undefined) {
    const { user, workspace, role } = session.data;
    return (
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Welcome, {user.name}</h1>
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
    <div className="flex flex-col items-start gap-3">
      <p>We could not load your account.</p>
      <Button variant="outline" onClick={handleRetry}>
        Try again
      </Button>
    </div>
  );
}
