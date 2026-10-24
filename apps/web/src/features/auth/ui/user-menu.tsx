'use client';

import { LogOutIcon, UserIcon } from 'lucide-react';
import type * as React from 'react';

import { useSession } from '@/entities/session';
import { roleLabel } from '@/shared/lib/role-label';
import { Button } from '@/shared/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu';
import { Skeleton } from '@/shared/ui/skeleton';
import type { SessionResponse } from '@clientry/shared/auth';

import { useLogout } from '../model/use-logout';

interface AccountSummaryProps {
  readonly session: SessionResponse;
}

function AccountSummary({ session }: AccountSummaryProps): React.JSX.Element {
  return (
    <>
      <DropdownMenuLabel className="flex flex-col gap-0.5 font-normal">
        <span className="truncate font-medium text-foreground">{session.user.name}</span>
        <span className="truncate text-muted-foreground">{session.user.email}</span>
        <span className="text-muted-foreground">{roleLabel(session.role)}</span>
      </DropdownMenuLabel>
      <DropdownMenuSeparator />
    </>
  );
}

// Without a session the menu still offers "Log out", so a broken session can be left.
export function UserMenu(): React.JSX.Element {
  const session = useSession();
  const logout = useLogout();
  if (session.isPending) {
    return <Skeleton data-testid="user-menu-skeleton" className="size-8 rounded-full" />;
  }
  const { data } = session;
  const handleLogout = (event: Event): void => {
    // Keeps the menu open, so the pending item stays visible.
    event.preventDefault();
    logout.mutate();
  };
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {/* An icon, not initials: visible text would have to be part of the name "Account". */}
        <Button variant="outline" size="icon" aria-label="Account" className="rounded-full">
          <UserIcon aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        {data !== undefined && <AccountSummary session={data} />}
        <DropdownMenuItem disabled={logout.isPending} onSelect={handleLogout}>
          <LogOutIcon aria-hidden="true" />
          Log out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
