import { dehydrate, HydrationBoundary } from '@tanstack/react-query';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';

import { createQueryClient } from '@/shared/api/query-client';
import { LOGIN_PATH } from '@/shared/lib/redirect-target';
import { verifyAccessToken } from '@/shared/lib/verify-access-token';
import { ACCESS_TOKEN_COOKIE } from '@clientry/shared/auth';

import { ShellHeader } from './_components/shell-header';
import { prefetchSession } from './_lib/prefetch-session';

const MAIN_ID = 'main';

interface AppLayoutProps {
  readonly children: ReactNode;
}

export default async function AppLayout({ children }: AppLayoutProps): Promise<ReactNode> {
  const cookieStore = await cookies();
  const session = await verifyAccessToken(cookieStore.get(ACCESS_TOKEN_COOKIE)?.value);
  // The proxy redirects first; this covers a path its matcher misses.
  if (session.status === 'anonymous') {
    redirect(LOGIN_PATH);
  }
  const queryClient = createQueryClient();
  await prefetchSession(queryClient, cookieStore, session);
  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <a
        href={`#${MAIN_ID}`}
        className="sr-only rounded-md bg-background px-3 py-2 focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:ring-3 focus:ring-ring/50"
      >
        Skip to content
      </a>
      <ShellHeader />
      <main id={MAIN_ID} tabIndex={-1} className="mx-auto w-full max-w-6xl px-4 py-8 outline-none">
        {children}
      </main>
    </HydrationBoundary>
  );
}
