'use client';

import { cn } from 'cn';
import { useEffect, useRef } from 'react';
import type * as React from 'react';

import { takeHeadingFocusRequest } from '@/shared/lib/heading-focus';

interface PageHeadingProps {
  readonly className?: string;
  readonly children: React.ReactNode;
}

// The heading a requested focus lands on when it mounts on the new page.
export function PageHeading({ className, children }: PageHeadingProps): React.JSX.Element {
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (takeHeadingFocusRequest()) {
      headingRef.current?.focus();
    }
  }, []);
  return (
    <h1
      ref={headingRef}
      tabIndex={-1}
      className={cn('text-2xl font-semibold tracking-tight outline-none', className)}
    >
      {children}
    </h1>
  );
}
