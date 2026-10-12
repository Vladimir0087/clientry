'use client';

import { useState } from 'react';
import type * as React from 'react';
import { toast } from 'sonner';

import { isForbidden, isNotFound } from '@/shared/api/api-status';
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
  AlertDialogTrigger,
} from '@/shared/ui/alert-dialog';
import { Button } from '@/shared/ui/button';
import { FormAlert } from '@/shared/ui/form-alert';
import { Spinner } from '@/shared/ui/spinner';

interface DeletionState {
  readonly isPending: boolean;
  readonly isSuccess: boolean;
  readonly error: unknown;
}

interface ConfirmDeleteDialogProps {
  readonly name: string;
  readonly description: string;
  // The toast for a 403, after which the dialog closes.
  readonly forbiddenMessage: string;
  readonly deletion: DeletionState;
  readonly onConfirm: (onError: (error: unknown) => void) => void;
}

// A 404 is left to the caller's mutation, which leaves the page for a record already gone.
export function ConfirmDeleteDialog({
  name,
  description,
  forbiddenMessage,
  deletion,
  onConfirm,
}: ConfirmDeleteDialogProps): React.JSX.Element {
  const [isOpen, setIsOpen] = useState(false);
  const [alert, setAlert] = useState<FormAlertContent | null>(null);
  // After a delete, or a 404 for one already gone, the page is leaving: a second press would send
  // another request.
  const isBusy = deletion.isPending || deletion.isSuccess || isNotFound(deletion.error);

  const handleOpenChange = (isNextOpen: boolean): void => {
    if (!isBusy) {
      setAlert(null);
      setIsOpen(isNextOpen);
    }
  };
  const handleError = (error: unknown): void => {
    if (isForbidden(error)) {
      setIsOpen(false);
      toast.error(forbiddenMessage);
    } else if (!isNotFound(error)) {
      setAlert(unexpectedAlert(error));
    }
  };
  const handleConfirm = (event: React.MouseEvent): void => {
    // The action would close the dialog before the request finishes.
    event.preventDefault();
    setAlert(null);
    onConfirm(handleError);
  };

  return (
    <AlertDialog open={isOpen} onOpenChange={handleOpenChange}>
      <AlertDialogTrigger asChild>
        <Button variant="destructive">Delete</Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="break-words">Delete {name}?</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <FormAlert alert={alert} />
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isBusy}>Cancel</AlertDialogCancel>
          <AlertDialogAction variant="destructive" disabled={isBusy} onClick={handleConfirm}>
            {deletion.isPending && <Spinner data-icon="inline-start" aria-hidden="true" />}
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
