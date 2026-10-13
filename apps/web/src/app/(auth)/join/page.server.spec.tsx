import { cookies } from 'next/headers';
import { isValidElement } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { ACCESS_TOKEN_COOKIE } from '@clientry/shared/auth';

import JoinPage from './page';
import { createAccessToken } from '../../../../test/tokens';

vi.mock('next/headers', () => ({ cookies: vi.fn() }));

type CookieStore = Awaited<ReturnType<typeof cookies>>;

function storeWith(token: string | undefined): CookieStore {
  const get = (name: string): { name: string; value: string } | undefined =>
    name === ACCESS_TOKEN_COOKIE && token !== undefined ? { name, value: token } : undefined;
  return { get } as unknown as CookieStore;
}

async function hasSessionWith(token: string | undefined): Promise<unknown> {
  vi.mocked(cookies).mockResolvedValue(storeWith(token));
  const element = await JoinPage();
  if (!isValidElement<{ hasSession: boolean }>(element)) {
    throw new Error('The join page did not render an element');
  }
  return element.props.hasSession;
}

describe('JoinPage', () => {
  it('should tell the form a session is held when the access cookie is live', async () => {
    expect(await hasSessionWith(await createAccessToken())).toBe(true);
  });

  it('should tell the form a session is held when the access cookie has expired', async () => {
    expect(await hasSessionWith(await createAccessToken({ expiresInSeconds: -60 }))).toBe(true);
  });

  it('should tell the form no session is held when there is no access cookie', async () => {
    expect(await hasSessionWith(undefined)).toBe(false);
  });
});
