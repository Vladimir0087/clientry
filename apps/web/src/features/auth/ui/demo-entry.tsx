'use client';

import { useEffect, useId, useRef, useState } from 'react';
import type * as React from 'react';

import { hasErrorCode } from '@/shared/api/api-status';
import { requestFailureAlert } from '@/shared/lib/submit-error';
import type { FormAlertContent } from '@/shared/lib/submit-error';
import { Button } from '@/shared/ui/button';
import { FormAlert } from '@/shared/ui/form-alert';
import { Spinner } from '@/shared/ui/spinner';
import type { MemberRole } from '@clientry/shared/auth';

import { useDemoLogin } from '../model/use-demo-login';
import { useEnterSession } from '../model/use-enter-session';

interface Failure {
  readonly role: MemberRole;
  readonly alert: FormAlertContent;
}

function alertFor(error: unknown): FormAlertContent {
  if (hasErrorCode(error, 'DEMO_UNAVAILABLE')) {
    return { message: 'The demo is being prepared. Try again in a minute.' };
  }
  return requestFailureAlert(error);
}

interface DemoEntryProps {
  readonly next: string | undefined;
  // Another way in is pending, so pressing here would start a second session.
  readonly isLocked: boolean;
  readonly onPendingChange: (isPending: boolean) => void;
}

export function DemoEntry({ next, isLocked, onPendingChange }: DemoEntryProps): React.JSX.Element {
  const headingId = useId();
  const demoLogin = useDemoLogin();
  const { isEntering, enterSession } = useEnterSession(next);
  const [failure, setFailure] = useState<Failure | null>(null);
  const ownerRef = useRef<HTMLButtonElement>(null);
  const managerRef = useRef<HTMLButtonElement>(null);
  const isBusy = demoLogin.isPending || isEntering;
  const pressedRole = isBusy ? demoLogin.variables : undefined;

  // The disabled button may have lost focus while pending; it gets it back with the alert.
  useEffect(() => {
    if (failure !== null) {
      (failure.role === 'owner' ? ownerRef : managerRef).current?.focus();
    }
  }, [failure]);

  const handleEnter = async (role: MemberRole): Promise<void> => {
    setFailure(null);
    onPendingChange(true);
    try {
      enterSession(await demoLogin.mutateAsync(role));
    } catch (error) {
      onPendingChange(false);
      setFailure({ role, alert: alertFor(error) });
    }
  };

  const isDisabled = isLocked || isBusy;
  return (
    <section
      aria-labelledby={headingId}
      className="flex flex-col gap-3 rounded-lg border bg-muted p-4"
    >
      <h2 id={headingId} className="text-sm font-semibold">
        Just looking around?
      </h2>
      <p className="text-sm">
        Explore a sample web studio with clients, deals and tasks already in place. No sign-up
        needed.
      </p>
      <FormAlert alert={failure?.alert ?? null} shouldFocus={false} />
      <Button
        ref={ownerRef}
        type="button"
        variant="outline"
        size="lg"
        className="w-full"
        disabled={isDisabled}
        onClick={() => void handleEnter('owner')}
      >
        {pressedRole === 'owner' && <Spinner data-icon="inline-start" aria-hidden="true" />}
        Explore the demo
      </Button>
      <Button
        ref={managerRef}
        type="button"
        variant="link"
        size="sm"
        className="self-center"
        disabled={isDisabled}
        onClick={() => void handleEnter('manager')}
      >
        {pressedRole === 'manager' && <Spinner data-icon="inline-start" aria-hidden="true" />}
        or see it as a manager
      </Button>
    </section>
  );
}
