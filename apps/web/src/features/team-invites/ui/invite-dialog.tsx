'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useId, useRef, useState } from 'react';
import type * as React from 'react';
import { toast } from 'sonner';

import { inviteKeys } from '@/entities/invite';
import { handleInsufficientRole, useSession } from '@/entities/session';
import { ApiError } from '@/shared/api/api-error';
import { hasErrorCode } from '@/shared/api/api-status';
import { formatDate } from '@/shared/lib/local-date-time';
import { JOIN_PATH } from '@/shared/lib/redirect-target';
import { unexpectedAlert } from '@/shared/lib/submit-error';
import type { FormAlertContent } from '@/shared/lib/submit-error';
import { Button } from '@/shared/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/shared/ui/dialog';
import { Field, FieldDescription, FieldLabel } from '@/shared/ui/field';
import { FormAlert } from '@/shared/ui/form-alert';
import { Input } from '@/shared/ui/input';
import { Spinner } from '@/shared/ui/spinner';
import { INVITE_LIMITS } from '@clientry/shared/workspaces';
import type { CreatedInviteResponse } from '@clientry/shared/workspaces';

import { useCreateInvite } from '../model/use-invite-mutations';

const LIMIT_REACHED = 'INVITE_LIMIT_REACHED';

function failureAlert(error: unknown): FormAlertContent {
  if (error instanceof ApiError && error.code === LIMIT_REACHED) {
    return {
      message:
        error.detail ??
        `A workspace can have at most ${String(INVITE_LIMITS.pending)} pending invites`,
    };
  }
  return unexpectedAlert(error);
}

// The token goes in the fragment, which browsers never send to a server.
function inviteLink(token: string): string {
  return `${window.location.origin}${JOIN_PATH}#${token}`;
}

interface CreatedLinkProps {
  readonly invite: CreatedInviteResponse;
}

interface CopyLink {
  readonly inputRef: React.RefObject<HTMLInputElement | null>;
  readonly isCopyRefused: boolean;
  readonly handleCopy: () => void;
}

function useCopyLink(link: string): CopyLink {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isCopyRefused, setIsCopyRefused] = useState(false);
  const handleCopyRefused = (): void => {
    setIsCopyRefused(true);
    inputRef.current?.focus();
    inputRef.current?.select();
  };
  // The clipboard API is missing outside a secure context, such as plain http on a LAN address.
  const handleCopy = (): void => {
    if (typeof navigator.clipboard === 'undefined') {
      handleCopyRefused();
      return;
    }
    navigator.clipboard.writeText(link).then(() => {
      setIsCopyRefused(false);
      toast.success('Link copied');
    }, handleCopyRefused);
  };
  return { inputRef, isCopyRefused, handleCopy };
}

function CreatedLink({ invite }: CreatedLinkProps): React.JSX.Element {
  const session = useSession();
  const fieldId = useId();
  const copyRef = useRef<HTMLButtonElement>(null);
  const link = inviteLink(invite.token);
  const { inputRef, isCopyRefused, handleCopy } = useCopyLink(link);
  const workspace = session.data?.workspace.name ?? 'the workspace';

  useEffect(() => {
    copyRef.current?.focus();
  }, []);

  return (
    <div className="flex flex-col gap-4">
      <Field>
        <FieldLabel htmlFor={fieldId}>Invite link</FieldLabel>
        <Input
          ref={inputRef}
          id={fieldId}
          readOnly
          value={link}
          aria-describedby={isCopyRefused ? `${fieldId}-hint` : undefined}
        />
        {isCopyRefused && (
          <FieldDescription id={`${fieldId}-hint`}>Copy the selected link.</FieldDescription>
        )}
      </Field>
      <Button ref={copyRef} type="button" variant="outline" onClick={handleCopy}>
        Copy link
      </Button>
      <p className="text-sm text-muted-foreground">
        Anyone with this link can join {workspace} as a manager until {formatDate(invite.expiresAt)}
        . It works once and is shown only now.
      </p>
    </div>
  );
}

interface InviteCreation {
  readonly isOpen: boolean;
  readonly isPending: boolean;
  readonly invite: CreatedInviteResponse | null;
  readonly alert: FormAlertContent | null;
  readonly handleOpenChange: (isNextOpen: boolean) => void;
  readonly handleCreate: () => void;
}

// Opening starts afresh, so a created link is never shown again; closing keeps the content while
// the dialog fades out.
function useInviteCreation(): InviteCreation {
  const queryClient = useQueryClient();
  const creation = useCreateInvite();
  const [isOpen, setIsOpen] = useState(false);
  const [invite, setInvite] = useState<CreatedInviteResponse | null>(null);
  const [alert, setAlert] = useState<FormAlertContent | null>(null);
  const handleOpenChange = (isNextOpen: boolean): void => {
    if (creation.isPending) {
      return;
    }
    if (isNextOpen) {
      setInvite(null);
      setAlert(null);
    }
    setIsOpen(isNextOpen);
  };
  const handleError = (error: unknown): void => {
    if (handleInsufficientRole(error, queryClient)) {
      setIsOpen(false);
      return;
    }
    // The list was filled elsewhere; refetched, it disables the button and shows why.
    if (hasErrorCode(error, LIMIT_REACHED)) {
      void queryClient.invalidateQueries({ queryKey: inviteKeys.all });
    }
    setAlert(failureAlert(error));
  };
  const handleCreate = (): void => {
    setAlert(null);
    creation.mutate(undefined, { onSuccess: setInvite, onError: handleError });
  };
  return { isOpen, isPending: creation.isPending, invite, alert, handleOpenChange, handleCreate };
}

interface DialogButtonsProps {
  readonly hasInvite: boolean;
  readonly isPending: boolean;
  readonly onCreate: () => void;
}

function DialogButtons({ hasInvite, isPending, onCreate }: DialogButtonsProps): React.JSX.Element {
  if (hasInvite) {
    return (
      <DialogClose asChild>
        <Button>Done</Button>
      </DialogClose>
    );
  }
  return (
    <>
      <DialogClose asChild>
        <Button variant="outline" disabled={isPending}>
          Cancel
        </Button>
      </DialogClose>
      <Button disabled={isPending} onClick={onCreate}>
        {isPending && <Spinner data-icon="inline-start" aria-hidden="true" />}
        Create link
      </Button>
    </>
  );
}

interface InviteDialogProps {
  readonly isLimitReached: boolean;
  readonly hintId: string;
  // Where focus goes when the dialog closes on a trigger the new invite just disabled.
  readonly onTriggerDisabled: () => void;
}

export function InviteDialog({
  isLimitReached,
  hintId,
  onTriggerDisabled,
}: InviteDialogProps): React.JSX.Element {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const { isOpen, isPending, invite, alert, handleOpenChange, handleCreate } = useInviteCreation();
  const handleCloseAutoFocus = (event: Event): void => {
    if (triggerRef.current?.disabled === true) {
      event.preventDefault();
      onTriggerDisabled();
    }
  };
  // The link is shown only once, so a stray click must not lose it; Escape and Done still close.
  const handleInteractOutside = (event: Event): void => {
    if (invite !== null) {
      event.preventDefault();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button
          ref={triggerRef}
          disabled={isLimitReached}
          aria-describedby={isLimitReached ? hintId : undefined}
        >
          Invite member
        </Button>
      </DialogTrigger>
      <DialogContent
        // The dialog stays open while the link is created, so its close button would do nothing.
        showCloseButton={!isPending}
        onCloseAutoFocus={handleCloseAutoFocus}
        onInteractOutside={handleInteractOutside}
      >
        <DialogHeader>
          <DialogTitle>Invite a member</DialogTitle>
          <DialogDescription>
            The person joins as a manager: they work with clients, deals and tasks and delete only
            what they added. You can make them an owner later.
          </DialogDescription>
        </DialogHeader>
        {invite !== null && <CreatedLink invite={invite} />}
        <FormAlert alert={alert} />
        <DialogFooter>
          <DialogButtons
            hasInvite={invite !== null}
            isPending={isPending}
            onCreate={handleCreate}
          />
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
