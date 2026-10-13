'use client';

import { InfoIcon } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type * as React from 'react';

import { isNotFound } from '@/shared/api/api-status';
import { formatDate } from '@/shared/lib/local-date-time';
import { LOGIN_PATH } from '@/shared/lib/redirect-target';
import { Alert, AlertTitle } from '@/shared/ui/alert';
import { CardContent, CardHeader } from '@/shared/ui/card';
import { RetryMessage } from '@/shared/ui/retry-message';
import { Skeleton } from '@/shared/ui/skeleton';
import { inviteTokenSchema } from '@clientry/shared/auth';

import { JoinForm } from './join-form';
import { useInvitePreview } from '../model/use-invite';

const HEADING_ID = 'join-heading';

type TokenState =
  | { readonly kind: 'unread' }
  | { readonly kind: 'missing' }
  | { readonly kind: 'malformed' }
  | { readonly kind: 'valid'; readonly token: string };

function subscribe(onChange: () => void): () => void {
  window.addEventListener('hashchange', onChange);
  return () => {
    window.removeEventListener('hashchange', onChange);
  };
}

// The fragment never reaches the server, so the server snapshot is unread and the browser reads it
// after hydration; it stays in the address bar, so a reload works.
function useTokenState(): TokenState {
  const hash = useSyncExternalStore(
    subscribe,
    () => window.location.hash,
    () => null,
  );
  if (hash === null) {
    return { kind: 'unread' };
  }
  const raw = hash.replace(/^#/, '');
  if (raw === '') {
    return { kind: 'missing' };
  }
  const result = inviteTokenSchema.safeParse(raw);
  return result.success ? { kind: 'valid', token: result.data } : { kind: 'malformed' };
}

interface HeadingProps {
  readonly children: React.ReactNode;
  // Set when the heading replaces the control that had focus, such as the submitted form.
  readonly isFocused?: boolean;
}

function Heading({ children, isFocused = false }: HeadingProps): React.JSX.Element {
  const ref = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (isFocused) {
      ref.current?.focus();
    }
  }, [isFocused]);
  return (
    <h1
      ref={ref}
      id={HEADING_ID}
      tabIndex={-1}
      className="text-lg font-semibold break-words outline-none"
    >
      {children}
    </h1>
  );
}

function FormSkeleton(): React.JSX.Element {
  return (
    <CardContent className="flex flex-col gap-4" data-testid="join-skeleton">
      <Skeleton className="h-9 w-full" />
      <Skeleton className="h-9 w-full" />
      <Skeleton className="h-9 w-full" />
      <Skeleton className="h-10 w-full" />
    </CardContent>
  );
}

function JoinSkeleton(): React.JSX.Element {
  return (
    <>
      <CardHeader>
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-4 w-full" />
      </CardHeader>
      <FormSkeleton />
    </>
  );
}

interface MessageCardProps {
  readonly title: string;
  readonly text: string;
  readonly hasLoginLink?: boolean;
  readonly isFocused?: boolean;
}

function MessageCard({
  title,
  text,
  hasLoginLink = false,
  isFocused = false,
}: MessageCardProps): React.JSX.Element {
  return (
    <>
      <CardHeader>
        <Heading isFocused={isFocused}>{title}</Heading>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <p className="text-sm text-muted-foreground">{text}</p>
        {hasLoginLink && (
          <Link href={LOGIN_PATH} className="text-sm font-medium underline underline-offset-4">
            Log in
          </Link>
        )}
      </CardContent>
    </>
  );
}

interface InvalidInviteProps {
  readonly isFocused?: boolean;
}

// One state for a malformed, unknown, used, revoked or expired link: the next step is the same.
function InvalidInvite({ isFocused = false }: InvalidInviteProps): React.JSX.Element {
  return (
    <MessageCard
      title="Invite not valid"
      text="This invite link is invalid, already used or expired. Ask the workspace owner for a new one."
      hasLoginLink
      isFocused={isFocused}
    />
  );
}

interface ValidInviteProps {
  readonly token: string;
  readonly hasSession: boolean;
}

function ValidInvite({ token, hasSession }: ValidInviteProps): React.JSX.Element {
  const preview = useInvitePreview(token);
  const [isInvalidated, setIsInvalidated] = useState(false);
  // Try again leaves focus on the heading, so a retry that ends in 404 hands it to the new one.
  const [hasRetried, setHasRetried] = useState(false);
  if (isInvalidated || isNotFound(preview.error)) {
    return <InvalidInvite isFocused={isInvalidated || hasRetried} />;
  }
  if (preview.data === undefined) {
    if (preview.errorUpdateCount === 0) {
      return <JoinSkeleton />;
    }
    const handleRetry = (): void => {
      setHasRetried(true);
      void preview.refetch();
    };
    // The heading sits where the loaded invite's heading will, and stays while a retry loads,
    // so it keeps focus through the retry.
    return (
      <>
        <CardHeader>
          <Heading>Join workspace</Heading>
        </CardHeader>
        {preview.isError ? (
          <CardContent>
            <RetryMessage
              message="We could not load the invite."
              focusTargetId={HEADING_ID}
              onRetry={handleRetry}
            />
          </CardContent>
        ) : (
          <FormSkeleton />
        )}
      </>
    );
  }
  const { workspace, invitedBy, expiresAt } = preview.data;
  const handleInvalid = (): void => {
    setIsInvalidated(true);
  };
  return (
    <>
      <CardHeader>
        <Heading>Join {workspace.name}</Heading>
        <p className="text-sm break-words text-muted-foreground">
          {invitedBy.name} invited you to join as a manager. The link expires on{' '}
          {formatDate(expiresAt)}.
        </p>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        {hasSession && (
          <Alert role="status">
            <InfoIcon aria-hidden="true" />
            <AlertTitle className="line-clamp-none">
              You are signed in on this browser. Joining signs you out of that account first.
            </AlertTitle>
          </Alert>
        )}
        <JoinForm token={token} onInvalid={handleInvalid} />
      </CardContent>
    </>
  );
}

interface JoinViewProps {
  // True when the browser holds an access cookie, live or expired: the join will revoke it.
  readonly hasSession: boolean;
}

export function JoinView({ hasSession }: JoinViewProps): React.JSX.Element {
  const state = useTokenState();
  switch (state.kind) {
    case 'unread':
      return <JoinSkeleton />;
    case 'missing':
      return (
        <MessageCard
          title="Invite link incomplete"
          text="Open the link from your invite message again."
        />
      );
    case 'malformed':
      return <InvalidInvite />;
    case 'valid':
      return <ValidInvite key={state.token} token={state.token} hasSession={hasSession} />;
  }
}
