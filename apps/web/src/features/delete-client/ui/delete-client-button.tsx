'use client';

import { useState } from 'react';
import type * as React from 'react';
import { toast } from 'sonner';

import { isNotFound } from '@/entities/client';
import { useSession } from '@/entities/session';
import { ApiError } from '@/shared/api/api-error';
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
  AlertDialogTrigger,
} from '@/shared/ui/alert-dialog';
import { Button } from '@/shared/ui/button';
import { FormAlert } from '@/shared/ui/form-alert';
import { Spinner } from '@/shared/ui/spinner';
import { canDeleteRecord } from '@clientry/shared/auth';
import type { Client } from '@clientry/shared/clients';

import { useDeleteClient } from '../model/use-delete-client';

const FORBIDDEN = 403;

function isForbidden(error: unknown): boolean {
  return error instanceof ApiError && error.status === FORBIDDEN;
}

function failureAlert(error: unknown): FormAlertContent {
  return {
    message: 'Something went wrong. Try again.',
    reference: error instanceof ApiError ? error.requestId : undefined,
  };
}

interface DeleteClientButtonProps {
  readonly client: Pick<Client, 'id' | 'name' | 'createdBy'>;
}

function DeleteClientDialog({ client }: DeleteClientButtonProps): React.JSX.Element {
  const deletion = useDeleteClient();
  const [isOpen, setIsOpen] = useState(false);
  const [alert, setAlert] = useState<FormAlertContent | null>(null);
  const isPending = deletion.isPending;

  const handleOpenChange = (isNextOpen: boolean): void => {
    if (!isPending) {
      setAlert(null);
      setIsOpen(isNextOpen);
    }
  };
  const handleError = (error: unknown): void => {
    if (isForbidden(error)) {
      setIsOpen(false);
      toast.error('You can delete only clients you created.');
    } else if (!isNotFound(error)) {
      setAlert(failureAlert(error));
    }
  };
  const handleConfirm = (event: React.MouseEvent): void => {
    // The action would close the dialog before the request finishes.
    event.preventDefault();
    setAlert(null);
    deletion.mutate(client.id, { onError: handleError });
  };

  return (
    <AlertDialog open={isOpen} onOpenChange={handleOpenChange}>
      <AlertDialogTrigger asChild>
        <Button variant="destructive">Delete</Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="break-words">Delete {client.name}?</AlertDialogTitle>
          <AlertDialogDescription>
            The client disappears from the list and search. You can undo this right after.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <FormAlert alert={alert} />
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
          <AlertDialogAction variant="destructive" disabled={isPending} onClick={handleConfirm}>
            {isPending && <Spinner data-icon="inline-start" aria-hidden="true" />}
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// Hidden while the session loads and when the role rule would refuse; the API checks it again.
export function DeleteClientButton({ client }: DeleteClientButtonProps): React.JSX.Element | null {
  const session = useSession();
  if (session.data === undefined) {
    return null;
  }
  const actor = { userId: session.data.user.id, role: session.data.role };
  return canDeleteRecord(actor, client.createdBy.id) ? (
    <DeleteClientDialog client={client} />
  ) : null;
}
