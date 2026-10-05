import { useMutation } from '@tanstack/react-query';
import type { UseMutationResult } from '@tanstack/react-query';

import { apiRequest } from '@/shared/api/browser-client';
import { sessionResponseSchema } from '@clientry/shared/auth';
import type { RegisterRequest, SessionResponse } from '@clientry/shared/auth';

export function useRegister(): UseMutationResult<SessionResponse, Error, RegisterRequest> {
  return useMutation({
    mutationFn: (input: RegisterRequest) =>
      apiRequest('/api/auth/register', sessionResponseSchema, { method: 'POST', body: input }),
  });
}
