import { useMutation } from '@tanstack/react-query';
import type { UseMutationResult } from '@tanstack/react-query';

import { apiRequest } from '@/shared/api/browser-client';
import { sessionResponseSchema } from '@clientry/shared/auth';
import type { LoginRequest, SessionResponse } from '@clientry/shared/auth';

export function useLogin(): UseMutationResult<SessionResponse, Error, LoginRequest> {
  return useMutation({
    mutationFn: (input: LoginRequest) =>
      apiRequest('/api/auth/login', sessionResponseSchema, { method: 'POST', body: input }),
  });
}
