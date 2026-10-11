import { apiRequest } from '@/shared/api/browser-client';
import { memberListResponseSchema } from '@clientry/shared/workspaces';
import type { MemberListResponse } from '@clientry/shared/workspaces';

export function fetchMembers(signal?: AbortSignal): Promise<MemberListResponse> {
  return apiRequest('/api/members', memberListResponseSchema, { signal });
}
