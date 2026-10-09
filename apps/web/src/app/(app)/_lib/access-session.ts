import 'server-only';

import { cookies } from 'next/headers';
import { cache } from 'react';

import { verifyAccessToken } from '@/shared/lib/verify-access-token';
import type { AccessSession } from '@/shared/lib/verify-access-token';
import { ACCESS_TOKEN_COOKIE } from '@clientry/shared/auth';

import type { PrefetchRequest } from './prefetch';

// No arguments: cache() matches calls by argument, and the cookie store objects the layout and
// the page receive are different, so the token is verified once per request only this way.
export const getAccessSession = cache(async (): Promise<AccessSession> => {
  const cookieStore = await cookies();
  return verifyAccessToken(cookieStore.get(ACCESS_TOKEN_COOKIE)?.value);
});

export async function getPrefetchRequest(): Promise<PrefetchRequest> {
  return { cookies: await cookies(), session: await getAccessSession() };
}
