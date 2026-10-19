'use client';

import { useEffect, useId, useRef } from 'react';
import type * as React from 'react';

import { MemberTable, useMembers } from '@/entities/member';
import { permissionActor, useSession } from '@/entities/session';
import { MemberActions } from '@/features/manage-member';
import { WorkspaceName } from '@/features/rename-workspace';
import { PendingInvites } from '@/features/team-invites';
import { PageHeading } from '@/shared/ui/page-heading';
import { RetryMessage } from '@/shared/ui/retry-message';
import { Skeleton } from '@/shared/ui/skeleton';
import { can, hasPermission } from '@clientry/shared/auth';
import type { SessionResponse } from '@clientry/shared/auth';
import type { Member } from '@clientry/shared/workspaces';

const PAGE_HEADING_ID = 'team-heading';
const SECTION_HEADING_CLASS = 'text-lg font-semibold outline-none';
const MANAGERS_LINE = 'Only owners can invite people and change roles.';
const DEMO_LINE =
  'Inviting people, changing roles, removing members and renaming the workspace are turned off in the demo.';

// The owner controls go with the caller's role, so the page heading takes focus.
function focusPageHeadingById(): void {
  document.getElementById(PAGE_HEADING_ID)?.focus();
}

function WorkspaceSection(): React.JSX.Element {
  const session = useSession();
  const headingId = useId();
  const handleRetry = (): void => {
    void session.refetch();
  };
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-4">
      <h2 id={headingId} tabIndex={-1} className={SECTION_HEADING_CLASS}>
        Workspace
      </h2>
      {session.data !== undefined ? (
        <WorkspaceName
          name={session.data.workspace.name}
          canRename={can(permissionActor(session.data), 'workspace.manage')}
        />
      ) : session.isError ? (
        <RetryMessage
          message="We could not load the workspace."
          focusTargetId={headingId}
          onRetry={handleRetry}
        />
      ) : (
        <Skeleton data-testid="workspace-name-skeleton" className="h-10 w-64" />
      )}
    </section>
  );
}

// A refetch or a lost role can drop the focused row or menu button; the heading then takes focus.
// Portal nodes (menus, dialogs) are skipped: they return focus by themselves.
function useFocusHeadingWhenFocusGoes(
  headingRef: React.RefObject<HTMLHeadingElement | null>,
): Pick<React.HTMLAttributes<HTMLElement>, 'onFocus' | 'onBlur'> {
  const focusedRef = useRef<Element | null>(null);
  useEffect(() => {
    const focused = focusedRef.current;
    if (focused !== null && !focused.isConnected && document.activeElement === document.body) {
      focusedRef.current = null;
      headingRef.current?.focus();
    }
  });
  return {
    onFocus: (event) => {
      if (event.target instanceof Element && event.currentTarget.contains(event.target)) {
        focusedRef.current = event.target;
      }
    },
    // A removed node blurs with no next target, so only a move to another element forgets it.
    onBlur: (event) => {
      const next = event.relatedTarget;
      if (next instanceof Element && !event.currentTarget.contains(next)) {
        focusedRef.current = null;
      }
    },
  };
}

// A manager is held back by the role, the demo owner by the demo lock.
function lockedLineFor(session: SessionResponse): string {
  return hasPermission(session.role, 'team.manage') ? DEMO_LINE : MANAGERS_LINE;
}

interface MembersSectionProps {
  readonly session: SessionResponse | undefined;
  readonly canManageTeam: boolean;
}

function MembersSection({ session, canManageTeam }: MembersSectionProps): React.JSX.Element {
  const members = useMembers();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const headingId = useId();
  const focusHandlers = useFocusHeadingWhenFocusGoes(headingRef);
  const items = members.data?.items;
  const currentUserId = session?.user.id;
  const handleRetry = (): void => {
    void members.refetch();
  };
  const handleRemoved = (): void => {
    headingRef.current?.focus();
  };
  const renderActions = (member: Member): React.ReactNode => (
    <MemberActions
      member={member}
      members={items ?? []}
      currentUserId={currentUserId}
      onRemoved={handleRemoved}
      onSelfDemoted={focusPageHeadingById}
    />
  );
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-4" {...focusHandlers}>
      <h2 ref={headingRef} id={headingId} tabIndex={-1} className={SECTION_HEADING_CLASS}>
        Members
        {items !== undefined && (
          <>
            {' '}
            <span className="ml-1 text-muted-foreground">{items.length}</span>
          </>
        )}
      </h2>
      {session !== undefined && !canManageTeam && (
        <p className="text-sm text-muted-foreground">{lockedLineFor(session)}</p>
      )}
      {items !== undefined ? (
        <MemberTable
          members={items}
          currentUserId={currentUserId}
          renderActions={canManageTeam ? renderActions : undefined}
        />
      ) : members.isError ? (
        <RetryMessage
          message="We could not load members."
          focusTargetId={headingId}
          onRetry={handleRetry}
        />
      ) : (
        <div data-testid="members-skeleton" className="flex flex-col gap-2">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      )}
    </section>
  );
}

// A role lost in another tab or to another owner removes the owner controls, the focused one
// included, so the page heading takes focus instead of the body.
function useFocusWhenControlsGo(canManageTeam: boolean): void {
  const canManageBeforeRef = useRef(canManageTeam);
  useEffect(() => {
    const canManageBefore = canManageBeforeRef.current;
    canManageBeforeRef.current = canManageTeam;
    if (canManageBefore && !canManageTeam && document.activeElement === document.body) {
      focusPageHeadingById();
    }
  }, [canManageTeam]);
}

// Open to every member; owner controls follow the session, and the API decides.
export function TeamView(): React.JSX.Element {
  const session = useSession();
  const canManageTeam =
    session.data !== undefined && can(permissionActor(session.data), 'team.manage');
  useFocusWhenControlsGo(canManageTeam);
  return (
    <div className="flex flex-col gap-8">
      <PageHeading id={PAGE_HEADING_ID}>Team</PageHeading>
      <WorkspaceSection />
      <MembersSection session={session.data} canManageTeam={canManageTeam} />
      {canManageTeam && <PendingInvites />}
    </div>
  );
}
