import { useQuery } from '@tanstack/react-query';
import type { UseQueryResult } from '@tanstack/react-query';

import type { StageListResponse } from '@clientry/shared/deals';

import { stageKeys } from './deal-keys';
import { fetchStages } from '../api/stage-api';

export function useStages(): UseQueryResult<StageListResponse> {
  return useQuery({
    queryKey: stageKeys.list,
    queryFn: ({ signal }) => fetchStages(signal),
  });
}
