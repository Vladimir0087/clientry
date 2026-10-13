'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import type * as React from 'react';
import { toast } from 'sonner';

import { memberKeys } from '@/entities/member';
import { unexpectedAlert } from '@/shared/lib/submit-error';
import type { FormAlertContent } from '@/shared/lib/submit-error';
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
import { FormAlert } from '@/shared/ui/form-alert';
import { FormField } from '@/shared/ui/form-field';
import { OptionSelect } from '@/shared/ui/option-select';
import type { SelectOption } from '@/shared/ui/option-select';
import { Spinner } from '@/shared/ui/spinner';
import { TRANSFER_TO_MESSAGE } from '@clientry/shared/workspaces';
import type { Member } from '@clientry/shared/workspaces';

import { handleMemberError, transferToMessage } from '../model/member-errors';
import { useRemoveMember } from '../model/use-member-mutations';

interface ReceiverOption extends SelectOption {
  readonly name: string;
}

// The caller first, as the default receiver, then the others by name.
function receiverOptions(
  member: Member,
  members: readonly Member[],
  currentUserId: string | undefined,
): ReceiverOption[] {
  const others = members.filter(({ id }) => id !== member.id);
  const you = others.filter(({ id }) => id === currentUserId);
  const rest = others
    .filter(({ id }) => id !== currentUserId)
    .toSorted((first, second) => first.name.localeCompare(second.name));
  return [
    ...you.map(({ id, name }) => ({ value: id, label: `${name} (you)`, name })),
    ...rest.map(({ id, name }) => ({ value: id, label: name, name })),
  ];
}

// The select is disabled while the removal is pending, so it takes focus once that ends. A count,
// so the same error shown again asks for focus again.
function useFocusOnError(
  focusRequest: number,
  isPending: boolean,
): React.RefObject<HTMLButtonElement | null> {
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (focusRequest > 0 && !isPending) {
      ref.current?.focus();
    }
  }, [focusRequest, isPending]);
  return ref;
}

interface MemberRemoval {
  readonly isPending: boolean;
  readonly receiverError: string | undefined;
  readonly focusRequest: number;
  readonly alert: FormAlertContent | null;
  readonly clearReceiverError: () => void;
  readonly handleConfirm: (event: React.MouseEvent) => void;
}

function useMemberRemoval(
  member: Member,
  receiver: ReceiverOption | undefined,
  onClose: (isRemoved: boolean) => void,
): MemberRemoval {
  const queryClient = useQueryClient();
  const removal = useRemoveMember();
  const [receiverError, setReceiverError] = useState<string | undefined>(undefined);
  const [focusRequest, setFocusRequest] = useState(0);
  const [alert, setAlert] = useState<FormAlertContent | null>(null);
  const showReceiverError = (message: string): void => {
    setReceiverError(message);
    setFocusRequest((count) => count + 1);
  };
  const handleError = (error: unknown): void => {
    const message = transferToMessage(error);
    if (message !== undefined) {
      showReceiverError(message);
      void queryClient.invalidateQueries({ queryKey: memberKeys.all });
      return;
    }
    if (handleMemberError(error, queryClient)) {
      onClose(false);
      return;
    }
    setAlert(unexpectedAlert(error));
  };
  const handleConfirm = (event: React.MouseEvent): void => {
    event.preventDefault();
    if (receiver === undefined) {
      showReceiverError(TRANSFER_TO_MESSAGE);
      return;
    }
    setAlert(null);
    setReceiverError(undefined);
    setFocusRequest(0);
    const onSuccess = (): void => {
      toast.success(`${member.name} was removed. Open deals and tasks went to ${receiver.name}.`);
      onClose(true);
    };
    removal.mutate(
      { id: member.id, transferTo: receiver.value },
      { onSuccess, onError: handleError },
    );
  };
  const clearReceiverError = (): void => {
    setReceiverError(undefined);
  };
  return {
    isPending: removal.isPending,
    receiverError,
    focusRequest,
    alert,
    clearReceiverError,
    handleConfirm,
  };
}

interface RemoveMemberDialogProps {
  readonly member: Member;
  readonly members: readonly Member[];
  readonly currentUserId: string | undefined;
  readonly onClose: (isRemoved: boolean) => void;
  readonly onCloseAutoFocus: (event: Event) => void;
}

export function RemoveMemberDialog({
  member,
  members,
  currentUserId,
  onClose,
  onCloseAutoFocus,
}: RemoveMemberDialogProps): React.JSX.Element {
  const options = receiverOptions(member, members, currentUserId);
  const [chosen, setChosen] = useState(options[0]?.value ?? '');
  // A refetch may drop the chosen receiver; the select then stays empty until another is chosen.
  const receiver = options.find(({ value }) => value === chosen);
  const { isPending, receiverError, focusRequest, alert, clearReceiverError, handleConfirm } =
    useMemberRemoval(member, receiver, onClose);
  const selectRef = useFocusOnError(focusRequest, isPending);
  const handleOpenChange = (isOpen: boolean): void => {
    if (!isOpen && !isPending) {
      onClose(false);
    }
  };
  const handleChange = (value: string): void => {
    setChosen(value);
    clearReceiverError();
  };

  return (
    <AlertDialog open onOpenChange={handleOpenChange}>
      <AlertDialogContent onCloseAutoFocus={onCloseAutoFocus}>
        <AlertDialogHeader>
          <AlertDialogTitle className="break-words">Remove {member.name}?</AlertDialogTitle>
          <AlertDialogDescription className="break-words">
            {member.name} loses access right away and is signed out on every device. Clients, closed
            deals and completed tasks they worked on stay in the workspace.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <FormField label="Hand over open deals and tasks to" error={receiverError}>
          {(control) => (
            <OptionSelect
              {...control}
              ref={selectRef}
              options={options}
              value={receiver?.value ?? ''}
              isDisabled={isPending}
              className="w-full"
              onChange={handleChange}
            />
          )}
        </FormField>
        <FormAlert alert={alert} />
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
          <AlertDialogAction variant="destructive" disabled={isPending} onClick={handleConfirm}>
            {isPending && <Spinner data-icon="inline-start" aria-hidden="true" />}
            Remove
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
