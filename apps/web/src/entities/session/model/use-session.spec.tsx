import { QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';

import { createQueryClient } from '@/shared/api/query-client';

import { sessionKeys } from './session-keys';
import { useSession } from './use-session';
import { TEST_SESSION } from '../../../../test/fixtures';

describe('useSession', () => {
  it('should cache the session from /api/auth/me under its key when it loads', async () => {
    const queryClient = createQueryClient();
    const wrapper = ({ children }: { readonly children: ReactNode }): ReactNode => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );

    const { result } = renderHook(() => useSession(), { wrapper });

    await waitFor(() => {
      expect(result.current.data).toEqual(TEST_SESSION);
    });
    expect(queryClient.getQueryData(sessionKeys.current)).toEqual(TEST_SESSION);
  });
});
