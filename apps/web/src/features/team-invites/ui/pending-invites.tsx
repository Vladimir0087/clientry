'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useId, useRef, useState } from 'react';
import type * as React from 'react';
import { toast } from 'sonner';

import { inviteKeys, useInvites } from '@/entities/invite';
import {
  handleInsufficientRole,
  permissionActor,
  sessionKeys,
  useSession,
} from '@/entities/session';
import { hasErrorCode, isNotFound } from '@/shared/api/api-status';
import { formatDate } from '@/shared/lib/local-date-time';
import { GENERIC_MESSAGE } from '@/shared/lib/submit-error';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/shared/ui/alert-dialog';
import { Button } from '@/shared/ui/button';
import { LocalDate } from '@/shared/ui/local-date';
import { RetryMessage } from '@/shared/ui/retry-message';
import { Skeleton } from '@/shared/ui/skeleton';
import { Spinner } from '@/shared/ui/spinner';
import { can } from '@clientry/shared/auth';
import { INVITE_LIMITS } from '@clientry/shared/workspaces';
import type { InviteSummary } from '@clientry/shared/workspaces';

import { InviteDialog } from './invite-dialog';
import { useRevokeInvite } from '../model/use-invite-mutations';

interface RevokeDialogProps {
  readonly invite: InviteSummary;
  // isGone: the item and its button are gone, revoked now or before.
  readonly onClose: (isGone: boolean) => void;
  readonly onCloseAutoFocus: (event: Event) => void;
}

function RevokeDialog({ invite, onClose, onCloseAutoFocus }: RevokeDialogProps): React.JSX.Element {
  const queryClient = useQueryClient();
  const revoke = useRevokeInvite();
  const handleConfirm = (event: React.MouseEvent): void => {
    event.preventDefault();
    revoke.mutate(invite.id, {
      onSuccess: () => {
        toast.success('Invite revoked');
        onClose(true);
      },
      onError: (error) => {
        if (isNotFound(error)) {
          toast.error('This invite is no longer pending.');
          void queryClient.invalidateQueries({ queryKey: inviteKeys.all });
          onClose(true);
          return;
        }
        if (!handleInsufficientRole(error, queryClient)) {
          toast.error(GENERIC_MESSAGE);
        }
        onClose(false);
      },
    });
  };
  const handleOpenChange = (isOpen: boolean): void => {
    if (!isOpen && !revoke.isPending) {
      onClose(false);
    }
  };
  return (
    <AlertDialog open onOpenChange={handleOpenChange}>
      <AlertDialogContent onCloseAutoFocus={onCloseAutoFocus}>
        <AlertDialogHeader>
          <AlertDialogTitle>Revoke this invite?</AlertDialogTitle>
          <AlertDialogDescription>The link stops working right away.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={revoke.isPending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={revoke.isPending}
            onClick={handleConfirm}
          >
            {revoke.isPending && <Spinner data-icon="inline-start" aria-hidden="true" />}
            Revoke
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

interface InviteItemProps {
  readonly invite: InviteSummary;
  readonly onRevoke: (invite: InviteSummary, trigger: HTMLButtonElement) => void;
}

function InviteItem({ invite, onRevoke }: InviteItemProps): React.JSX.Element {
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 p-4">
      <div className="flex flex-col gap-1 text-sm">
        <span className="font-medium">Invited by {invite.createdBy.name}</span>
        <span className="text-muted-foreground">
          Created <LocalDate value={invite.createdAt} /> · Expires{' '}
          <LocalDate value={invite.expiresAt} />
        </span>
      </div>
      <Button
        variant="outline"
        size="sm"
        aria-label={`Revoke invite created ${formatDate(invite.createdAt)}`}
        onClick={(event) => {
          onRevoke(invite, event.currentTarget);
        }}
      >
        Revoke
      </Button>
    </li>
  );
}

interface InviteListProps {
  readonly items: readonly InviteSummary[];
  readonly headingRef: React.RefObject<HTMLHeadingElement | null>;
}

function InviteList({ items, headingRef }: InviteListProps): React.JSX.Element {
  const [revoking, setRevoking] = useState<InviteSummary | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const isGoneRef = useRef(false);
  const handleRevoke = (invite: InviteSummary, trigger: HTMLButtonElement): void => {
    triggerRef.current = trigger;
    setRevoking(invite);
  };
  const handleClose = (isGone: boolean): void => {
    isGoneRef.current = isGone;
    setRevoking(null);
  };
  // The item and its button are gone after a revoke, so the section heading takes focus.
  const handleCloseAutoFocus = (event: Event): void => {
    event.preventDefault();
    const trigger = triggerRef.current;
    if (!isGoneRef.current && trigger?.isConnected === true) {
      trigger.focus();
      return;
    }
    headingRef.current?.focus();
  };
  // The dialog sits outside the empty check: a refetch that empties the list must not unmount it.
  return (
    <>
      {items.length === 0 ? (
        <p className="text-muted-foreground">No pending invites</p>
      ) : (
        <ul className="flex flex-col divide-y rounded-lg border">
          {items.map((invite) => (
            <InviteItem key={invite.id} invite={invite} onRevoke={handleRevoke} />
          ))}
        </ul>
      )}
      {revoking !== null && (
        <RevokeDialog
          invite={revoking}
          onClose={handleClose}
          onCloseAutoFocus={handleCloseAutoFocus}
        />
      )}
    </>
  );
}

// A list refused for the role means it changed elsewhere; the refetched session drops the section.
function useRefusedListCheck(error: unknown): void {
  const queryClient = useQueryClient();
  useEffect(() => {
    if (hasErrorCode(error, 'INSUFFICIENT_ROLE')) {
      void queryClient.invalidateQueries({ queryKey: sessionKeys.current });
    }
  }, [error, queryClient]);
}

// Only for owners: the page leaves the section out for a session without team.manage.
export function PendingInvites(): React.JSX.Element {
  const session = useSession();
  const invites = useInvites({
    enabled: session.data !== undefined && can(permissionActor(session.data), 'team.manage'),
  });
  useRefusedListCheck(invites.error);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const headingId = useId();
  const hintId = useId();
  const items = invites.data?.items;
  const isLimitReached = (items?.length ?? 0) >= INVITE_LIMITS.pending;
  const handleRetry = (): void => {
    void invites.refetch();
  };
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2
          ref={headingRef}
          id={headingId}
          tabIndex={-1}
          className="text-lg font-semibold outline-none"
        >
          Pending invites
        </h2>
        <InviteDialog
          isLimitReached={isLimitReached}
          hintId={hintId}
          onTriggerDisabled={() => headingRef.current?.focus()}
        />
      </div>
      {isLimitReached && (
        <p id={hintId} className="text-sm text-muted-foreground">
          You can have up to {INVITE_LIMITS.pending} pending invites. Revoke one to create another.
        </p>
      )}
      {items !== undefined ? (
        <InviteList items={items} headingRef={headingRef} />
      ) : invites.isError ? (
        <RetryMessage
          message="We could not load invites."
          focusTargetId={headingId}
          onRetry={handleRetry}
        />
      ) : (
        <div data-testid="invites-skeleton" className="flex flex-col gap-2">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      )}
    </section>
  );
}
