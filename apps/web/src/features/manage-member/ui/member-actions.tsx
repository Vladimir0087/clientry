'use client';

import { useQueryClient } from '@tanstack/react-query';
import { cn } from 'cn';
import { EllipsisIcon } from 'lucide-react';
import { useRef, useState } from 'react';
import type * as React from 'react';
import { toast } from 'sonner';

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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu';
import { Spinner } from '@/shared/ui/spinner';
import type { MemberRole } from '@clientry/shared/auth';
import type { Member } from '@clientry/shared/workspaces';

import { RemoveMemberDialog } from './remove-member-dialog';
import { handleMemberError } from '../model/member-errors';
import { useChangeRole } from '../model/use-member-mutations';

type OpenDialog = 'demote-self' | 'remove' | null;

interface MemberActionsProps {
  readonly member: Member;
  readonly members: readonly Member[];
  readonly currentUserId: string | undefined;
  // The row and its button are gone after a removal, so focus goes elsewhere.
  readonly onRemoved: () => void;
  readonly onSelfDemoted: () => void;
}

function roleToast(member: Member, role: MemberRole, isSelf: boolean): string {
  if (isSelf) {
    return role === 'owner' ? 'You are now an owner' : 'You are now a manager';
  }
  return `${member.name} is now ${role === 'owner' ? 'an owner' : 'a manager'}`;
}

interface DemoteSelfDialogProps {
  readonly isPending: boolean;
  readonly onConfirm: () => void;
  readonly onClose: () => void;
  readonly onCloseAutoFocus: (event: Event) => void;
}

function DemoteSelfDialog({
  isPending,
  onConfirm,
  onClose,
  onCloseAutoFocus,
}: DemoteSelfDialogProps): React.JSX.Element {
  const handleOpenChange = (isOpen: boolean): void => {
    if (!isOpen && !isPending) {
      onClose();
    }
  };
  const handleConfirm = (event: React.MouseEvent): void => {
    event.preventDefault();
    onConfirm();
  };
  return (
    <AlertDialog open onOpenChange={handleOpenChange}>
      <AlertDialogContent onCloseAutoFocus={onCloseAutoFocus}>
        <AlertDialogHeader>
          <AlertDialogTitle>Make yourself a manager?</AlertDialogTitle>
          <AlertDialogDescription>
            You will no longer be able to invite people, change roles or rename the workspace.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
          <AlertDialogAction disabled={isPending} onClick={handleConfirm}>
            {isPending && <Spinner data-icon="inline-start" aria-hidden="true" />}
            Make me a manager
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

interface RoleChange {
  readonly nextRole: MemberRole;
  readonly isPending: boolean;
  readonly send: (role: MemberRole, onDone?: () => void) => void;
}

// onFailed runs after the failure is shown, so an open confirmation can close.
function useRoleChange(
  member: Member,
  currentUserId: string | undefined,
  onFailed: () => void,
): RoleChange {
  const queryClient = useQueryClient();
  const changeRole = useChangeRole(currentUserId);
  const nextRole: MemberRole = member.role === 'owner' ? 'manager' : 'owner';
  const isSelf = member.id === currentUserId;
  const handleError = (error: unknown): void => {
    if (!handleMemberError(error, queryClient)) {
      toast.error(GENERIC_MESSAGE);
    }
    onFailed();
  };
  const send = (role: MemberRole, onDone?: () => void): void => {
    const onSuccess = (): void => {
      toast.success(roleToast(member, role, isSelf));
      onDone?.();
    };
    changeRole.mutate({ id: member.id, role }, { onSuccess, onError: handleError });
  };
  return { nextRole, isPending: changeRole.isPending, send };
}

interface ReturnFocus {
  readonly triggerRef: React.RefObject<HTMLButtonElement | null>;
  // Where focus goes when the open dialog closes; null returns it to the menu button.
  readonly focusOnClose: (focus: (() => void) | null) => void;
  readonly handleCloseAutoFocus: (event: Event) => void;
}

// The dialogs open from a menu item that is gone by then, so focus is returned by hand.
// onTriggerGone: a refetch dropped the row, menu button included, while its dialog was open.
function useReturnFocus(onTriggerGone: () => void): ReturnFocus {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const focusElsewhereRef = useRef<(() => void) | null>(null);
  const focusOnClose = (focus: (() => void) | null): void => {
    focusElsewhereRef.current = focus;
  };
  const handleCloseAutoFocus = (event: Event): void => {
    event.preventDefault();
    const focusElsewhere = focusElsewhereRef.current;
    focusElsewhereRef.current = null;
    if (focusElsewhere !== null) {
      focusElsewhere();
      return;
    }
    const trigger = triggerRef.current;
    if (trigger?.isConnected === true) {
      trigger.focus();
      return;
    }
    if (document.activeElement === document.body) {
      onTriggerGone();
    }
  };
  return { triggerRef, focusOnClose, handleCloseAutoFocus };
}

interface RoleItemProps {
  readonly nextRole: MemberRole;
  // The only owner's own row.
  readonly isBlocked: boolean;
  readonly isPending: boolean;
  readonly onSelect: () => void;
}

// aria-disabled, not disabled: Radix skips disabled items, so the reason would never be read out.
function RoleItem({ nextRole, isBlocked, isPending, onSelect }: RoleItemProps): React.JSX.Element {
  const handleSelect = (event: Event): void => {
    if (isBlocked) {
      event.preventDefault();
      return;
    }
    onSelect();
  };
  return (
    <DropdownMenuItem
      disabled={isPending}
      // Overrides the aria-disabled Radix derives from disabled, so it covers isPending too.
      aria-disabled={isBlocked || isPending || undefined}
      onSelect={handleSelect}
      className={cn('flex-col items-start gap-0.5', isBlocked && 'opacity-50')}
    >
      {nextRole === 'owner' ? 'Make owner' : 'Make manager'}
      {isBlocked && <span className="text-xs text-muted-foreground">Add another owner first</span>}
    </DropdownMenuItem>
  );
}

interface RowMenuProps {
  readonly member: Member;
  readonly nextRole: MemberRole;
  readonly isSelf: boolean;
  readonly isOnlyOwner: boolean;
  readonly isPending: boolean;
  readonly triggerRef: React.Ref<HTMLButtonElement>;
  readonly onRoleSelect: () => void;
  readonly onRemoveSelect: () => void;
}

function RowMenu({
  member,
  nextRole,
  isSelf,
  isOnlyOwner,
  isPending,
  triggerRef,
  onRoleSelect,
  onRemoveSelect,
}: RowMenuProps): React.JSX.Element {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          ref={triggerRef}
          variant="ghost"
          size="icon"
          aria-label={`Actions for ${member.name}`}
        >
          <EllipsisIcon aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <RoleItem
          nextRole={nextRole}
          isBlocked={isSelf && isOnlyOwner}
          isPending={isPending}
          onSelect={onRoleSelect}
        />
        {!isSelf && (
          <DropdownMenuItem variant="destructive" onSelect={onRemoveSelect}>
            Remove from workspace
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// Only owners get this menu; the API checks the role again.
export function MemberActions({
  member,
  members,
  currentUserId,
  onRemoved,
  onSelfDemoted,
}: MemberActionsProps): React.JSX.Element {
  const [dialog, setDialog] = useState<OpenDialog>(null);
  const closeDialog = (): void => {
    setDialog(null);
  };
  const { triggerRef, focusOnClose, handleCloseAutoFocus } = useReturnFocus(onRemoved);
  const roleChange = useRoleChange(member, currentUserId, closeDialog);
  const isSelf = member.id === currentUserId;
  const isOnlyOwner =
    member.role === 'owner' && members.filter(({ role }) => role === 'owner').length <= 1;
  const handleRoleSelect = (): void => {
    if (isSelf && roleChange.nextRole === 'manager') {
      setDialog('demote-self');
      return;
    }
    roleChange.send(roleChange.nextRole);
  };
  // Always a demotion, even if a refetch shows another role while the dialog is open.
  const handleDemoteSelf = (): void => {
    roleChange.send('manager', () => {
      focusOnClose(onSelfDemoted);
      closeDialog();
    });
  };
  const handleRemoveClose = (isRemoved: boolean): void => {
    focusOnClose(isRemoved ? onRemoved : null);
    closeDialog();
  };

  return (
    <>
      <RowMenu
        member={member}
        nextRole={roleChange.nextRole}
        isSelf={isSelf}
        isOnlyOwner={isOnlyOwner}
        isPending={roleChange.isPending}
        triggerRef={triggerRef}
        onRoleSelect={handleRoleSelect}
        onRemoveSelect={() => {
          setDialog('remove');
        }}
      />
      {dialog === 'demote-self' && (
        <DemoteSelfDialog
          isPending={roleChange.isPending}
          onConfirm={handleDemoteSelf}
          onClose={closeDialog}
          onCloseAutoFocus={handleCloseAutoFocus}
        />
      )}
      {dialog === 'remove' && (
        <RemoveMemberDialog
          member={member}
          members={members}
          currentUserId={currentUserId}
          onClose={handleRemoveClose}
          onCloseAutoFocus={handleCloseAutoFocus}
        />
      )}
    </>
  );
}
