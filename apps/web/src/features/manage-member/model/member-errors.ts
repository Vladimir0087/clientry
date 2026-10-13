import type { QueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { memberKeys } from '@/entities/member';
import { handleInsufficientRole } from '@/entities/session';
import { fieldErrorMessage, hasErrorCode, isNotFound } from '@/shared/api/api-status';

function refetchMembers(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: memberKeys.all });
}

// Returns false for an outcome the caller shows itself, such as an alert in the removal dialog.
export function handleMemberError(error: unknown, queryClient: QueryClient): boolean {
  if (hasErrorCode(error, 'LAST_OWNER')) {
    toast.error('A workspace needs at least one owner.');
    refetchMembers(queryClient);
    return true;
  }
  if (isNotFound(error)) {
    toast.error('This member is no longer in the workspace.');
    refetchMembers(queryClient);
    return true;
  }
  return handleInsufficientRole(error, queryClient);
}

// The receiver was removed meanwhile.
export function transferToMessage(error: unknown): string | undefined {
  return fieldErrorMessage(error, 'transferTo');
}
