import { z } from 'zod';

import { apiRequest } from '@/shared/api/browser-client';
import {
  clientListResponseSchema,
  clientResponseSchema,
  clientTagsResponseSchema,
} from '@clientry/shared/clients';
import type {
  Client,
  ClientListResponse,
  ClientTagsResponse,
  CreateClientRequest,
  UpdateClientRequest,
} from '@clientry/shared/clients';

import { clientListPath } from './client-list-path';
import type { ClientFilters } from '../model/client-filters';

export function fetchClientList(
  filters: ClientFilters,
  cursor: string | null,
  signal?: AbortSignal,
): Promise<ClientListResponse> {
  return apiRequest(clientListPath(filters, cursor), clientListResponseSchema, { signal });
}

const SEARCH_LIMIT = 10;

// A short list by name for pickers; an empty term lists the first clients by name.
export function fetchClientSearch(q: string, signal?: AbortSignal): Promise<ClientListResponse> {
  const params = new URLSearchParams();
  if (q !== '') {
    params.set('q', q);
  }
  params.set('sort', 'name_asc');
  params.set('limit', String(SEARCH_LIMIT));
  return apiRequest(`/api/clients?${params.toString()}`, clientListResponseSchema, { signal });
}

export function fetchClient(id: string, signal?: AbortSignal): Promise<Client> {
  return apiRequest(`/api/clients/${id}`, clientResponseSchema, { signal });
}

export function fetchClientTags(signal?: AbortSignal): Promise<ClientTagsResponse> {
  return apiRequest('/api/clients/tags', clientTagsResponseSchema, { signal });
}

export function createClient(input: CreateClientRequest): Promise<Client> {
  return apiRequest('/api/clients', clientResponseSchema, { method: 'POST', body: input });
}

export function updateClient(id: string, changes: UpdateClientRequest): Promise<Client> {
  return apiRequest(`/api/clients/${id}`, clientResponseSchema, {
    method: 'PATCH',
    body: changes,
  });
}

export function deleteClient(id: string): Promise<void> {
  return apiRequest(`/api/clients/${id}`, z.undefined(), { method: 'DELETE' });
}

export function restoreClient(id: string): Promise<Client> {
  return apiRequest(`/api/clients/${id}/restore`, clientResponseSchema, { method: 'POST' });
}
