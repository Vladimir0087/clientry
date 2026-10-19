import { useMutation } from '@tanstack/react-query';
import type { UseMutationResult } from '@tanstack/react-query';

import { apiRequest } from '@/shared/api/browser-client';
import { sessionResponseSchema } from '@clientry/shared/auth';
import type { DemoLoginRequest, MemberRole, SessionResponse } from '@clientry/shared/auth';

export function useDemoLogin(): UseMutationResult<SessionResponse, Error, MemberRole> {
  return useMutation({
    mutationFn: (role: MemberRole) => {
      const body: DemoLoginRequest = { role };
      return apiRequest('/api/auth/demo', sessionResponseSchema, { method: 'POST', body });
    },
  });
}
