'use client';

import Link from 'next/link';
import type * as React from 'react';

import { useSession } from '@/entities/session';
import { UserMenu } from '@/features/auth';
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

export function ShellHeader(): React.JSX.Element {
  return (
    <header className="border-b">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4 sm:gap-4">
        <Link href="/" className="font-semibold tracking-tight">
          Clientry
        </Link>
        <MainNav />
        <WorkspaceName />
        <div className="ml-auto flex items-center gap-2">
          <ThemeMenu />
          <UserMenu />
        </div>
      </div>
    </header>
  );
}
