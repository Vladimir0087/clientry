import type { QueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { hasErrorCode } from '@/shared/api/api-status';

import { sessionKeys } from './session-keys';

// The role changed in another tab or by another owner; the refetched session hides the controls.
export function handleInsufficientRole(error: unknown, queryClient: QueryClient): boolean {
  if (!hasErrorCode(error, 'INSUFFICIENT_ROLE')) {
    return false;
  }
  toast.error('Only owners can do this.');
  void queryClient.invalidateQueries({ queryKey: sessionKeys.current });
  return true;
}
