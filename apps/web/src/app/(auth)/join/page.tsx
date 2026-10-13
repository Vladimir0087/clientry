import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import type { ReactNode } from 'react';

import { JoinView } from '@/features/auth';
import { verifyAccessToken } from '@/shared/lib/verify-access-token';
import { ACCESS_TOKEN_COOKIE } from '@clientry/shared/auth';

export const metadata: Metadata = { title: 'Join workspace' };

// Never asks for /api/auth/me: for a visitor without a session that ends in a redirect to /login,
// which drops the fragment with the token.
export default async function JoinPage(): Promise<ReactNode> {
  const session = await verifyAccessToken((await cookies()).get(ACCESS_TOKEN_COOKIE)?.value);
  return <JoinView hasSession={session.status !== 'anonymous'} />;
}
