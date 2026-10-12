import { z } from 'zod';

import { apiRequest } from '@/shared/api/browser-client';
import {
  boardResponseSchema,
  dealHistoryResponseSchema,
  dealListResponseSchema,
  dealSchema,
} from '@clientry/shared/deals';
import type {
  Board,
  CreateDealRequest,
  Deal,
  DealHistoryResponse,
  DealListResponse,
  MoveDealRequest,
  UpdateDealRequest,
} from '@clientry/shared/deals';

import { boardPath } from './board-path';
import type { BoardFilters } from '../model/board-filters';

export function fetchBoard(filters: BoardFilters, signal?: AbortSignal): Promise<Board> {
  return apiRequest(boardPath(filters), boardResponseSchema, { signal });
}

export function fetchDeal(id: string, signal?: AbortSignal): Promise<Deal> {
  return apiRequest(`/api/deals/${id}`, dealSchema, { signal });
}

export function fetchDealHistory(id: string, signal?: AbortSignal): Promise<DealHistoryResponse> {
  return apiRequest(`/api/deals/${id}/history`, dealHistoryResponseSchema, { signal });
}

export function fetchClientDeals(
  clientId: string,
  signal?: AbortSignal,
): Promise<DealListResponse> {
  const query = new URLSearchParams({ clientId }).toString();
  return apiRequest(`/api/deals?${query}`, dealListResponseSchema, { signal });
}

export function createDeal(input: CreateDealRequest): Promise<Deal> {
  return apiRequest('/api/deals', dealSchema, { method: 'POST', body: input });
}

export function updateDeal(id: string, changes: UpdateDealRequest): Promise<Deal> {
  return apiRequest(`/api/deals/${id}`, dealSchema, { method: 'PATCH', body: changes });
}

export function moveDeal(id: string, move: MoveDealRequest): Promise<Deal> {
  return apiRequest(`/api/deals/${id}/move`, dealSchema, { method: 'POST', body: move });
}

export function deleteDeal(id: string): Promise<void> {
  return apiRequest(`/api/deals/${id}`, z.undefined(), { method: 'DELETE' });
}

export function restoreDeal(id: string): Promise<Deal> {
  return apiRequest(`/api/deals/${id}/restore`, dealSchema, { method: 'POST' });
}
