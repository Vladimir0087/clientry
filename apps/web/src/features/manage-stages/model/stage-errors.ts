import type { QueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { stageKeys } from '@/entities/deal';
import { sessionKeys } from '@/entities/session';
import { ApiError } from '@/shared/api/api-error';
import { hasErrorCode, isNotFound } from '@/shared/api/api-status';

const GENERIC_MESSAGE = 'Something went wrong. Try again.';
// Their detail says what rule the change broke; the list is refetched to show why.
const RULE_CODES = ['STAGE_LIMIT_REACHED', 'LAST_OPEN_STAGE', 'STAGE_NOT_DELETABLE'] as const;

interface StageErrorOptions {
  readonly queryClient: QueryClient;
  // A taken name belongs on the name field of the form that sent it.
  readonly onNameError?: (message: string) => void;
}

function refetchStages(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: stageKeys.all });
}

function nameMessage(error: unknown): string | undefined {
  if (!(error instanceof ApiError)) {
    return undefined;
  }
  if (error.code === 'STAGE_NAME_TAKEN') {
    return error.detail ?? 'A stage with this name already exists';
  }
  return error.errors.find((item) => item.path === 'name')?.message;
}

// Returns false for an outcome the caller shows itself, such as an alert in a dialog.
export function handleStageError(
  error: unknown,
  { queryClient, onNameError }: StageErrorOptions,
): boolean {
  const name = nameMessage(error);
  if (name !== undefined && onNameError !== undefined) {
    onNameError(name);
    return true;
  }
  if (RULE_CODES.some((code) => hasErrorCode(error, code))) {
    toast.error(
      error instanceof ApiError && error.detail !== undefined ? error.detail : GENERIC_MESSAGE,
    );
    refetchStages(queryClient);
    return true;
  }
  if (hasErrorCode(error, 'STAGES_CHANGED')) {
    toast.error('The stages were changed elsewhere. The list is updated.');
    refetchStages(queryClient);
    return true;
  }
  if (isNotFound(error)) {
    toast.error('This stage no longer exists.');
    refetchStages(queryClient);
    return true;
  }
  if (hasErrorCode(error, 'INSUFFICIENT_ROLE')) {
    toast.error('Only owners can change stages.');
    void queryClient.invalidateQueries({ queryKey: sessionKeys.current });
    return true;
  }
  return false;
}

export function toastGenericStageError(): void {
  toast.error(GENERIC_MESSAGE);
}

// What the API answers to deleting the last open stage, for a dialog a refetch left no target.
export function handleNoTargetLeft(queryClient: QueryClient): void {
  toast.error('A pipeline needs at least one open stage');
  refetchStages(queryClient);
}
