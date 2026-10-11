'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import type * as React from 'react';
import { useForm } from 'react-hook-form';
import type { UseFormReturn } from 'react-hook-form';

import { isNotFound } from '@/shared/api/api-status';
import { isFocusStranded } from '@/shared/lib/is-focus-stranded';
import { Button } from '@/shared/ui/button';
import { SubmitButton } from '@/shared/ui/submit-button';
import { TextField } from '@/shared/ui/text-field';
import { renameStageRequestSchema, STAGE_LIMITS } from '@clientry/shared/deals';
import type { RenameStageRequest, Stage } from '@clientry/shared/deals';

import { handleStageError, toastGenericStageError } from '../model/stage-errors';
import { useRenameStage } from '../model/use-stage-mutations';

interface RenameStageFormProps {
  readonly stage: Stage;
  readonly onDone: () => void;
  // A 404: the stage was deleted elsewhere and its row is about to go.
  readonly onGone: () => void;
}

function useRenameSubmit(
  form: UseFormReturn<RenameStageRequest>,
  { stage, onDone, onGone }: RenameStageFormProps,
): (event?: React.BaseSyntheticEvent) => Promise<void> {
  const queryClient = useQueryClient();
  const rename = useRenameStage();
  return form.handleSubmit(async ({ name }) => {
    try {
      await rename.mutateAsync({ id: stage.id, name });
      onDone();
    } catch (error) {
      const onNameError = (message: string): void => {
        form.setError('name', { type: 'server', message }, { shouldFocus: true });
      };
      if (!handleStageError(error, { queryClient, onNameError })) {
        toastGenericStageError();
      } else if (isNotFound(error)) {
        onGone();
        return;
      }
      if (isFocusStranded()) {
        form.setFocus('name');
      }
    }
  });
}

interface RenameButtonsProps {
  readonly isSubmitting: boolean;
  readonly isDirty: boolean;
  readonly onCancel: () => void;
  readonly onKeyDown: (event: React.KeyboardEvent) => void;
}

function RenameButtons({
  isSubmitting,
  isDirty,
  onCancel,
  onKeyDown,
}: RenameButtonsProps): React.JSX.Element {
  return (
    <div className="flex gap-2">
      <SubmitButton isSubmitting={isSubmitting} isDisabled={!isDirty} onKeyDown={onKeyDown}>
        Save
      </SubmitButton>
      <Button
        type="button"
        variant="outline"
        size="lg"
        disabled={isSubmitting}
        onClick={onCancel}
        onKeyDown={onKeyDown}
      >
        Cancel
      </Button>
    </div>
  );
}

export function RenameStageForm(props: RenameStageFormProps): React.JSX.Element {
  const { stage, onDone } = props;
  const form = useForm<RenameStageRequest>({
    resolver: zodResolver(renameStageRequestSchema),
    defaultValues: { name: stage.name },
  });
  const handleSubmit = useRenameSubmit(form, props);
  const { setFocus } = form;

  useEffect(() => {
    setFocus('name', { shouldSelect: true });
  }, [setFocus]);

  const { isSubmitting } = form.formState;
  // On every control, so Escape works from Save and Cancel too; not while saving, as the rename
  // would still land and its errors would have no form to show in.
  const handleKeyDown = (event: React.KeyboardEvent): void => {
    if (event.key === 'Escape' && !isSubmitting) {
      event.preventDefault();
      onDone();
    }
  };

  return (
    <form
      noValidate
      autoComplete="off"
      onSubmit={handleSubmit}
      className="flex w-full flex-col gap-3 sm:flex-row sm:items-end"
    >
      <div className="flex-1">
        <TextField
          label="Stage name"
          autoComplete="off"
          maxLength={STAGE_LIMITS.name}
          error={form.formState.errors.name?.message}
          onKeyDown={handleKeyDown}
          {...form.register('name')}
        />
      </div>
      <RenameButtons
        isSubmitting={isSubmitting}
        isDirty={form.formState.isDirty}
        onCancel={onDone}
        onKeyDown={handleKeyDown}
      />
    </form>
  );
}
