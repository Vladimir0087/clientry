import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { sessionKeys } from '@/entities/session';
import { resolveRedirectTarget } from '@/shared/lib/redirect-target';
import type { SessionResponse } from '@clientry/shared/auth';

export interface EnterSession {
  // Stays true until the page changes, so the form cannot start a second session meanwhile.
  readonly isEntering: boolean;
  readonly enterSession: (session: SessionResponse) => void;
}

export function useEnterSession(next: string | undefined): EnterSession {
  const queryClient = useQueryClient();
  const router = useRouter();
  const [isEntering, setIsEntering] = useState(false);
  const enterSession = (session: SessionResponse): void => {
    setIsEntering(true);
    // A tab sent here by a logout elsewhere still holds the previous user's data.
    queryClient.clear();
    queryClient.setQueryData(sessionKeys.current, session);
    router.replace(resolveRedirectTarget(next, window.location.origin));
  };
  return { isEntering, enterSession };
}
