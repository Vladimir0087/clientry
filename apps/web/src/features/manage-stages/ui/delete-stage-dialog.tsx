'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import type * as React from 'react';

import { stageKeys } from '@/entities/deal';
import { ApiError } from '@/shared/api/api-error';
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select';
import { Spinner } from '@/shared/ui/spinner';
import type { StageListItem } from '@clientry/shared/deals';

import { handleNoTargetLeft, handleStageError } from '../model/stage-errors';
import { defaultTargetId, openStagesOf } from '../model/stage-order';
import { useDeleteStage } from '../model/use-stage-mutations';

// The target stage was deleted or closed elsewhere since the list loaded.
function targetMessage(error: unknown): string | undefined {
  return error instanceof ApiError
    ? error.errors.find((item) => item.path === 'moveDealsTo')?.message
    : undefined;
}

function failureAlert(error: unknown): FormAlertContent {
  const message = targetMessage(error);
  return message === undefined ? unexpectedAlert(error) : { message };
}

function movesTo(count: number): string {
  return count === 1 ? 'Its 1 deal moves to' : `Its ${String(count)} deals move to`;
}

interface TargetSelectProps {
  readonly label: string;
  readonly targets: readonly StageListItem[];
  readonly value: string;
  readonly onChange: (stageId: string) => void;
}

// Named by the same words the dialog shows above it.
function TargetSelect({ label, targets, value, onChange }: TargetSelectProps): React.JSX.Element {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger aria-label={label} className="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent position="popper">
        {targets.map((target) => (
          <SelectItem key={target.id} value={target.id}>
            {target.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

interface StageDeletion {
  readonly isPending: boolean;
  readonly alert: FormAlertContent | null;
  readonly handleConfirm: (event: React.MouseEvent) => void;
  readonly handleCloseAutoFocus: (event: Event) => void;
}

function useStageDeletion(
  stage: StageListItem,
  target: string,
  { onClose, onReturnFocus }: Pick<DeleteStageDialogProps, 'onClose' | 'onReturnFocus'>,
): StageDeletion {
  const queryClient = useQueryClient();
  const deletion = useDeleteStage();
  const [alert, setAlert] = useState<FormAlertContent | null>(null);
  const shouldFocusHeadingRef = useRef(false);
  // The row goes, or keeps only a disabled Delete, so the heading takes focus.
  const closeToHeading = (): void => {
    shouldFocusHeadingRef.current = true;
    onClose();
  };
  const handleConfirm = (event: React.MouseEvent): void => {
    event.preventDefault();
    if (target === '') {
      handleNoTargetLeft(queryClient);
      closeToHeading();
      return;
    }
    setAlert(null);
    deletion.mutate(
      { id: stage.id, moveDealsTo: target },
      {
        onSuccess: closeToHeading,
        onError: (error) => {
          if (handleStageError(error, { queryClient })) {
            closeToHeading();
            return;
          }
          if (targetMessage(error) !== undefined) {
            void queryClient.invalidateQueries({ queryKey: stageKeys.all });
          }
          setAlert(failureAlert(error));
        },
      },
    );
  };
  // The dialog has no trigger of its own for Radix to return focus to.
  const handleCloseAutoFocus = (event: Event): void => {
    event.preventDefault();
    onReturnFocus(shouldFocusHeadingRef.current);
  };
  return { isPending: deletion.isPending, alert, handleConfirm, handleCloseAutoFocus };
}

interface DeleteStageDialogProps {
  readonly stage: StageListItem;
  readonly stages: readonly StageListItem[];
  readonly onClose: () => void;
  readonly onReturnFocus: (shouldFocusHeading: boolean) => void;
}

// Rendered by the list, not the row: the row disappears when the stage is deleted.
export function DeleteStageDialog({
  stage,
  stages,
  onClose,
  onReturnFocus,
}: DeleteStageDialogProps): React.JSX.Element {
  const [chosen, setChosen] = useState(defaultTargetId(stages, stage.id) ?? '');
  const targets = openStagesOf(stages).filter((item) => item.id !== stage.id);
  // A refetch may drop the chosen stage; the default one takes its place.
  const target = targets.some((item) => item.id === chosen)
    ? chosen
    : (defaultTargetId(stages, stage.id) ?? '');
  const { isPending, alert, handleConfirm, handleCloseAutoFocus } = useStageDeletion(
    stage,
    target,
    { onClose, onReturnFocus },
  );
  const hasDeals = stage.dealCount > 0;
  // The target is sent even without deals: deleted deals still sit in the stage.
  const description = hasDeals ? movesTo(stage.dealCount) : 'This stage has no deals.';
  const handleOpenChange = (isOpen: boolean): void => {
    if (!isOpen && !isPending) {
      onClose();
    }
  };

  return (
    <AlertDialog open onOpenChange={handleOpenChange}>
      <AlertDialogContent onCloseAutoFocus={handleCloseAutoFocus}>
        <AlertDialogHeader>
          <AlertDialogTitle className="break-words">Delete {stage.name}?</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        {hasDeals && (
          <TargetSelect label={description} targets={targets} value={target} onChange={setChosen} />
        )}
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
