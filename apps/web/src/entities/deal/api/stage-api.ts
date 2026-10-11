import { z } from 'zod';

import { apiRequest } from '@/shared/api/browser-client';
import { stageListResponseSchema, stageSchema } from '@clientry/shared/deals';
import type { Stage, StageListResponse } from '@clientry/shared/deals';

export function fetchStages(signal?: AbortSignal): Promise<StageListResponse> {
  return apiRequest('/api/stages', stageListResponseSchema, { signal });
}

export function createStage(name: string): Promise<Stage> {
  return apiRequest('/api/stages', stageSchema, { method: 'POST', body: { name } });
}

export function renameStage(id: string, name: string): Promise<Stage> {
  return apiRequest(`/api/stages/${id}`, stageSchema, { method: 'PATCH', body: { name } });
}

export function reorderStages(ids: readonly string[]): Promise<StageListResponse> {
  return apiRequest('/api/stages/order', stageListResponseSchema, {
    method: 'PUT',
    body: { ids },
  });
}

export function deleteStage(id: string, moveDealsTo: string): Promise<void> {
  const query = new URLSearchParams({ moveDealsTo }).toString();
  return apiRequest(`/api/stages/${id}?${query}`, z.undefined(), { method: 'DELETE' });
}
