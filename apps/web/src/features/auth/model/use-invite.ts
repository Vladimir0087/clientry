import { useMutation, useQuery } from '@tanstack/react-query';
import type { UseMutationResult, UseQueryResult } from '@tanstack/react-query';

import { apiRequest } from '@/shared/api/browser-client';
import { invitePreviewResponseSchema, sessionResponseSchema } from '@clientry/shared/auth';
import type {
  InviteLoginRequest,
  InvitePreviewResponse,
  InviteRegisterRequest,
  SessionResponse,
} from '@clientry/shared/auth';

// Its own root: invalidating the owner's invite lists leaves a visitor's preview alone.
const invitePreviewKey = (token: string) => ['invite-preview', token] as const;

// A read sent as POST, so the token stays out of URLs. Read once: a refetch on focus could swap
// the form for the invalid state while the person types.
export function useInvitePreview(token: string): UseQueryResult<InvitePreviewResponse> {
  return useQuery({
    queryKey: invitePreviewKey(token),
    staleTime: Infinity,
    queryFn: ({ signal }) =>
      apiRequest('/api/auth/invite/preview', invitePreviewResponseSchema, {
        method: 'POST',
        body: { token },
        signal,
      }),
  });
}

export function useRegisterByInvite(): UseMutationResult<
  SessionResponse,
  Error,
  InviteRegisterRequest
> {
  return useMutation({
    mutationFn: (input: InviteRegisterRequest) =>
      apiRequest('/api/auth/invite/register', sessionResponseSchema, {
        method: 'POST',
        body: input,
      }),
  });
}

export function useLoginByInvite(): UseMutationResult<SessionResponse, Error, InviteLoginRequest> {
  return useMutation({
    mutationFn: (input: InviteLoginRequest) =>
      apiRequest('/api/auth/invite/login', sessionResponseSchema, { method: 'POST', body: input }),
  });
}
