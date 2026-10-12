import { dehydrate, HydrationBoundary } from '@tanstack/react-query';
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';

import { createQueryClient } from '@/shared/api/query-client';
import { LOGIN_PATH } from '@/shared/lib/redirect-target';

import { ShellHeader } from './_components/shell-header';
import { getPrefetchRequest } from './_lib/access-session';
import { prefetchSession, prefetchUnreadCount } from './_lib/prefetch';

const MAIN_ID = 'main';

interface AppLayoutProps {
  readonly children: ReactNode;
}

export default async function AppLayout({ children }: AppLayoutProps): Promise<ReactNode> {
  const request = await getPrefetchRequest();
  // The proxy redirects first; this covers a path its matcher misses.
  if (request.session.status === 'anonymous') {
    redirect(LOGIN_PATH);
  }
  const queryClient = createQueryClient();
  await Promise.all([
    prefetchSession(queryClient, request),
    prefetchUnreadCount(queryClient, request),
  ]);
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
