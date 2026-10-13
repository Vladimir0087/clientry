import { z } from 'zod';

import { apiRequest } from '@/shared/api/browser-client';
import { createdInviteResponseSchema, inviteListResponseSchema } from '@clientry/shared/workspaces';
import type { CreatedInviteResponse, InviteListResponse } from '@clientry/shared/workspaces';

export function fetchInvites(signal?: AbortSignal): Promise<InviteListResponse> {
  return apiRequest('/api/invites', inviteListResponseSchema, { signal });
}

export function createInvite(): Promise<CreatedInviteResponse> {
  return apiRequest('/api/invites', createdInviteResponseSchema, { method: 'POST' });
}

export function revokeInvite(id: string): Promise<void> {
  return apiRequest(`/api/invites/${id}`, z.undefined(), { method: 'DELETE' });
}
