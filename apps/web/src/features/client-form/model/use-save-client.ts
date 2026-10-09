import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { QueryClient, UseMutationResult } from '@tanstack/react-query';

import { clientKeys, createClient, updateClient } from '@/entities/client';
import type { Client, CreateClientRequest, UpdateClientRequest } from '@clientry/shared/clients';

interface UpdateVariables {
  readonly id: string;
  readonly changes: UpdateClientRequest;
}

// The card opens from the cache; lists and tags refetch when shown next. The form's own tag
// suggestions are not refetched: the form unmounts at once, and the request would be cancelled.
function storeSavedClient(queryClient: QueryClient, client: Client): void {
  queryClient.setQueryData(clientKeys.detail(client.id), client);
  void queryClient.invalidateQueries({ queryKey: clientKeys.lists });
  void queryClient.invalidateQueries({ queryKey: clientKeys.tags, refetchType: 'none' });
}

export function useCreateClient(): UseMutationResult<Client, Error, CreateClientRequest> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateClientRequest) => createClient(input),
    onSuccess: (client) => {
      storeSavedClient(queryClient, client);
    },
  });
}

export function useUpdateClient(): UseMutationResult<Client, Error, UpdateVariables> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, changes }: UpdateVariables) => updateClient(id, changes),
    onSuccess: (client) => {
      storeSavedClient(queryClient, client);
    },
  });
}
