import { useQuery } from '@tanstack/react-query';
import type { UseQueryResult } from '@tanstack/react-query';

import type { Client } from '@clientry/shared/clients';

import { clientKeys } from './client-keys';
import { fetchClient } from '../api/client-api';

export function useClient(id: string): UseQueryResult<Client> {
  return useQuery({
    queryKey: clientKeys.detail(id),
    queryFn: ({ signal }) => fetchClient(id, signal),
  });
}
