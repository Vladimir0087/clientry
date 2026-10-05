import { HttpResponse } from 'msw';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { replaceLocation } from '@/shared/lib/navigation';

import { handleSessionExpired } from './handle-session-expired';
import { recordRequests } from '../../../test/msw/record';

describe('handleSessionExpired', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '/clients?q=a');
  });

  it('should log out once and then replace the page with /login and next when the session expires', async () => {
    const logouts = recordRequests(
      'post',
      '/api/auth/logout',
      () => new HttpResponse(null, { status: 204 }),
    );
    let logoutsBeforeNavigation = 0;
    vi.mocked(replaceLocation).mockImplementationOnce(() => {
      logoutsBeforeNavigation = logouts.length;
    });

    await handleSessionExpired();

    expect(logoutsBeforeNavigation).toBe(1);
    expect(logouts).toHaveLength(1);
    expect(replaceLocation).toHaveBeenCalledTimes(1);
    expect(replaceLocation).toHaveBeenCalledWith('/login?next=%2Fclients%3Fq%3Da');
  });

  it('should still navigate to /login when the logout fails', async () => {
    recordRequests('post', '/api/auth/logout', () => HttpResponse.error());

    await handleSessionExpired();

    expect(replaceLocation).toHaveBeenCalledWith('/login?next=%2Fclients%3Fq%3Da');
  });
});
