import { z } from 'zod';

import { apiRequest } from '@/shared/api/browser-client';
import { sessionResponseSchema } from '@clientry/shared/auth';
import type { SessionResponse } from '@clientry/shared/auth';

export function fetchSession(signal?: AbortSignal): Promise<SessionResponse> {
  return apiRequest('/api/auth/me', sessionResponseSchema, { signal });
}

export function logout(): Promise<void> {
  return apiRequest('/api/auth/logout', z.undefined(), { method: 'POST' });
}
