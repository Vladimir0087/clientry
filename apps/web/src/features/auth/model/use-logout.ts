import { useMutation } from '@tanstack/react-query';
import type { UseMutationResult } from '@tanstack/react-query';
import { toast } from 'sonner';

import { logout } from '@/entities/session';
import { replaceLocation } from '@/shared/lib/navigation';
import { LOGIN_PATH } from '@/shared/lib/redirect-target';

export function useLogout(): UseMutationResult<void, Error, void> {
  return useMutation({
    mutationFn: () => logout(),
    onSuccess: () => {
      replaceLocation(LOGIN_PATH);
    },
    onError: () => {
      toast.error('Could not log out. Try again.');
    },
  });
}
