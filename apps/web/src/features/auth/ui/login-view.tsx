'use client';

import { useState } from 'react';
import type * as React from 'react';

import { Separator } from '@/shared/ui/separator';

import { DemoEntry } from './demo-entry';
import { LoginForm } from './login-form';

type PendingEntry = 'login' | 'demo' | null;

interface LoginViewProps {
  readonly next: string | undefined;
}

// One way in at a time: while either is pending, and until the page changes, the other is off.
export function LoginView({ next }: LoginViewProps): React.JSX.Element {
  const [pending, setPending] = useState<PendingEntry>(null);
  const handleLoginPending = (isPending: boolean): void => {
    setPending(isPending ? 'login' : null);
  };
  const handleDemoPending = (isPending: boolean): void => {
    setPending(isPending ? 'demo' : null);
  };
  return (
    <div className="flex flex-col gap-6">
      <LoginForm next={next} isLocked={pending === 'demo'} onPendingChange={handleLoginPending} />
      <div className="flex items-center gap-3">
        <Separator className="flex-1" />
        <span className="text-xs text-muted-foreground">or</span>
        <Separator className="flex-1" />
      </div>
      <DemoEntry next={next} isLocked={pending === 'login'} onPendingChange={handleDemoPending} />
    </div>
  );
}
