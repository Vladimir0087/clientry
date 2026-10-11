'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import type * as React from 'react';
import { useForm } from 'react-hook-form';
import type { UseFormReturn, UseFormSetFocus } from 'react-hook-form';

import { hasErrorCode } from '@/shared/api/api-status';
import { isFocusStranded } from '@/shared/lib/is-focus-stranded';
import { SubmitButton } from '@/shared/ui/submit-button';
import { TextField } from '@/shared/ui/text-field';
import { createStageRequestSchema, STAGE_LIMITS } from '@clientry/shared/deals';
import type { CreateStageRequest } from '@clientry/shared/deals';

import { handleStageError, toastGenericStageError } from '../model/stage-errors';
import { useAddStage } from '../model/use-stage-mutations';

const STAGE_LIMIT_HINT = 'A pipeline can have at most 10 open stages.';

interface AddStageFormProps {
  readonly openCount: number;
  // Where focus goes once the field is disabled by the last stage the limit allows.
  readonly onLimitReached: () => void;
}

interface AddedStage {
  readonly name: string;
  readonly isLast: boolean;
}

interface StageAdding {
  readonly added: AddedStage | null;
  readonly handleSubmit: (event?: React.BaseSyntheticEvent) => Promise<void>;
  // Empties the status, so the next add is announced even when its text is the same.
  readonly handleNameChange: () => void;
}

// Focus stays with the form unless the user has moved on; at the limit the refetch disables the
// field, so the heading takes it.
function refocusAfterFailure(
  error: unknown,
  form: UseFormReturn<CreateStageRequest>,
  formElement: HTMLFormElement | null,
  onLimitReached: () => void,
): void {
  const isInForm = formElement?.contains(document.activeElement) === true;
  if (hasErrorCode(error, 'STAGE_LIMIT_REACHED') && (isInForm || isFocusStranded())) {
    onLimitReached();
  } else if (isFocusStranded()) {
    form.setFocus('name');
  }
}

function useStageAdding(
  form: UseFormReturn<CreateStageRequest>,
  openCount: number,
  onLimitReached: () => void,
): StageAdding {
  const queryClient = useQueryClient();
  const add = useAddStage();
  const [added, setAdded] = useState<AddedStage | null>(null);
  const handleSubmit = form.handleSubmit(async ({ name }, event) => {
    const formElement = event?.target instanceof HTMLFormElement ? event.target : null;
    try {
      const stage = await add.mutateAsync(name);
      form.reset({ name: '' });
      setAdded({ name: stage.name, isLast: openCount + 1 >= STAGE_LIMITS.openStages });
    } catch (error) {
      const onNameError = (message: string): void => {
        form.setError('name', { type: 'server', message }, { shouldFocus: true });
      };
      if (!handleStageError(error, { queryClient, onNameError })) {
        toastGenericStageError();
      }
      refocusAfterFailure(error, form, formElement, onLimitReached);
    }
  });
  const handleNameChange = (): void => {
    setAdded(null);
  };
  return { added, handleSubmit, handleNameChange };
}

// After the render that enables the form again; a field focused earlier would lose it.
function useFocusAfterAdding(
  added: AddedStage | null,
  setFocus: UseFormSetFocus<CreateStageRequest>,
  onLimitReached: () => void,
): void {
  useEffect(() => {
    if (added === null) {
      return;
    }
    if (added.isLast) {
      onLimitReached();
    } else {
      setFocus('name');
    }
  }, [added, setFocus, onLimitReached]);
}

function AddedStatus({ added }: { readonly added: AddedStage | null }): React.JSX.Element {
  return (
    <p role="status" className="sr-only">
      {added === null
        ? ''
        : `Stage ${added.name} added${added.isLast ? `. ${STAGE_LIMIT_HINT}` : ''}`}
    </p>
  );
}

export function AddStageForm({ openCount, onLimitReached }: AddStageFormProps): React.JSX.Element {
  const isFull = openCount >= STAGE_LIMITS.openStages;
  const form = useForm<CreateStageRequest>({
    resolver: zodResolver(createStageRequestSchema),
    defaultValues: { name: '' },
  });
  const { added, handleSubmit, handleNameChange } = useStageAdding(form, openCount, onLimitReached);
  useFocusAfterAdding(added, form.setFocus, onLimitReached);

  return (
    <>
      <form
        noValidate
        autoComplete="off"
        onSubmit={handleSubmit}
        className="flex max-w-xl flex-col gap-3 sm:flex-row sm:items-end"
      >
        <div className="flex-1">
          <TextField
            label="New stage"
            autoComplete="off"
            maxLength={STAGE_LIMITS.name}
            disabled={isFull}
            hint={isFull ? STAGE_LIMIT_HINT : undefined}
            error={form.formState.errors.name?.message}
            {...form.register('name', { onChange: handleNameChange })}
          />
        </div>
        <SubmitButton isSubmitting={form.formState.isSubmitting} isDisabled={isFull}>
          Add stage
        </SubmitButton>
      </form>
      <AddedStatus added={added} />
    </>
  );
}
