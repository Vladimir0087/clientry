'use client';

import { cn } from 'cn';
import type { Route } from 'next';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type * as React from 'react';

import { CLIENTS_PATH } from '@/entities/client';
import { DEALS_PATH } from '@/entities/deal';

interface NavItem {
  readonly href: Route;
  readonly label: string;
}

const NAV_ITEMS: readonly NavItem[] = [
  { href: CLIENTS_PATH, label: 'Clients' },
  { href: DEALS_PATH, label: 'Deals' },
];

function isCurrent(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function MainNav(): React.JSX.Element {
  const pathname = usePathname();
  return (
    <nav aria-label="Main">
      <ul className="flex items-center gap-1">
        {NAV_ITEMS.map(({ href, label }) => {
          const isActive = isCurrent(pathname, href);
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={isActive ? 'page' : undefined}
                className={cn(
                  'rounded-md px-2 py-1 text-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50',
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
