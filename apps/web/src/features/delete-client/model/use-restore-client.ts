import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { UseMutationResult } from '@tanstack/react-query';
import { toast } from 'sonner';

import { clientKeys, restoreClient } from '@/entities/client';
import type { Client } from '@clientry/shared/clients';

// Undo runs after the card has unmounted, and TanStack drops mutate() callbacks of an unmounted
// component; handlers in these options always run.
export function useRestoreClient(): UseMutationResult<Client, Error, string> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => restoreClient(id),
    onSuccess: (client) => {
      toast.success('Client restored');
      void queryClient.invalidateQueries({ queryKey: clientKeys.lists });
      void queryClient.invalidateQueries({ queryKey: clientKeys.tags });
      void queryClient.invalidateQueries({ queryKey: clientKeys.detail(client.id) });
    },
    onError: () => {
      toast.error('Could not restore the client.');
    },
  });
}
