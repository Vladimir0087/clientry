import { ChevronLeftIcon } from 'lucide-react';
import type { Route } from 'next';
import Link from 'next/link';
import type * as React from 'react';

interface BackLinkProps {
  readonly href: Route;
  readonly children: React.ReactNode;
}

export function BackLink({ href, children }: BackLinkProps): React.JSX.Element {
  return (
    <Link
      href={href}
      className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
    >
      <ChevronLeftIcon aria-hidden="true" className="size-4" />
      {children}
    </Link>
  );
}
