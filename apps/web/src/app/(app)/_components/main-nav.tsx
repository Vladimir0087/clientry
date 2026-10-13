'use client';

import { cn } from 'cn';
import type { Route } from 'next';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type * as React from 'react';

import { CLIENTS_PATH } from '@/entities/client';
import { DEALS_PATH } from '@/entities/deal';
import { TEAM_PATH } from '@/entities/member';
import { TASKS_PATH } from '@/entities/task';

interface NavItem {
  readonly href: Route;
  readonly label: string;
}

const NAV_ITEMS: readonly NavItem[] = [
  { href: CLIENTS_PATH, label: 'Clients' },
  { href: DEALS_PATH, label: 'Deals' },
  { href: TASKS_PATH, label: 'Tasks' },
  { href: TEAM_PATH, label: 'Team' },
];

function isCurrent(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

// Scrolls sideways inside itself if its links ever outgrow a phone; the page never does. The
// padding keeps the focus ring inside the scroll box, which clips everything beyond it.
export function MainNav(): React.JSX.Element {
  const pathname = usePathname();
  return (
    <nav aria-label="Main" className="min-w-0">
      <ul className="-mx-1 flex items-center gap-1 overflow-x-auto p-1">
        {NAV_ITEMS.map(({ href, label }) => {
          const isActive = isCurrent(pathname, href);
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={isActive ? 'page' : undefined}
                className={cn(
                  'block rounded-md px-2 py-1 text-sm whitespace-nowrap text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50',
                  isActive && 'font-medium text-foreground',
                )}
              >
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
