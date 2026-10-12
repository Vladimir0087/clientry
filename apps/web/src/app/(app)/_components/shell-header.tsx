'use client';

import Link from 'next/link';
import type * as React from 'react';

import { useSession } from '@/entities/session';
import { UserMenu } from '@/features/auth';
import { NotificationBell } from '@/features/notification-bell';
import { Skeleton } from '@/shared/ui/skeleton';
import { ThemeMenu } from '@/shared/ui/theme-menu';

import { MainNav } from './main-nav';

function WorkspaceName(): React.JSX.Element | null {
  const session = useSession();
  if (session.data !== undefined) {
    return (
      <span className="hidden truncate text-sm text-muted-foreground sm:block">
        {session.data.workspace.name}
      </span>
    );
  }
  if (session.isPending) {
    return <Skeleton data-testid="workspace-skeleton" className="hidden h-4 w-28 sm:block" />;
  }
  return null;
}

// Below sm two rows: the brand and the buttons, then the navigation on its own row.
export function ShellHeader(): React.JSX.Element {
  return (
    <header className="border-b">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-3 px-4 pb-2 sm:h-14 sm:flex-nowrap sm:gap-4 sm:pb-0">
        <Link href="/" className="flex h-14 items-center font-semibold tracking-tight sm:h-auto">
          Clientry
        </Link>
        <div className="order-last w-full min-w-0 sm:order-none sm:w-auto">
          <MainNav />
        </div>
        <WorkspaceName />
        <div className="ml-auto flex items-center gap-2">
          <NotificationBell />
          <ThemeMenu />
          <UserMenu />
        </div>
      </div>
    </header>
  );
}
