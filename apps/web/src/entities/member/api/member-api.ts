import { z } from 'zod';

import { apiRequest } from '@/shared/api/browser-client';
import type { MemberRole } from '@clientry/shared/auth';
import { memberListResponseSchema, memberSchema } from '@clientry/shared/workspaces';
import type { Member, MemberListResponse } from '@clientry/shared/workspaces';

export function fetchMembers(signal?: AbortSignal): Promise<MemberListResponse> {
  return apiRequest('/api/members', memberListResponseSchema, { signal });
}

export function changeMemberRole(id: string, role: MemberRole): Promise<Member> {
  return apiRequest(`/api/members/${id}`, memberSchema, { method: 'PATCH', body: { role } });
}

export function removeMember(id: string, transferTo: string): Promise<void> {
  const query = new URLSearchParams({ transferTo }).toString();
  return apiRequest(`/api/members/${id}?${query}`, z.undefined(), { method: 'DELETE' });
}
