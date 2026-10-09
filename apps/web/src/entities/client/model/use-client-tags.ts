import { useQuery } from '@tanstack/react-query';
import type { UseQueryResult } from '@tanstack/react-query';

import type { ClientTagsResponse } from '@clientry/shared/clients';

import { clientKeys } from './client-keys';
import { fetchClientTags } from '../api/client-api';

export function useClientTags(): UseQueryResult<ClientTagsResponse> {
  return useQuery({
    queryKey: clientKeys.tags,
    queryFn: ({ signal }) => fetchClientTags(signal),
  });
}
