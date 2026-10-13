import Link from 'next/link';
import type * as React from 'react';

import { authPageHref } from '@/shared/lib/redirect-target';

import { handleKeepFieldFocus } from './keep-field-focus';

interface AuthSwitchLinkProps {
  readonly prompt: string;
  readonly path: Parameters<typeof authPageHref>[0];
  readonly next: string | undefined;
  readonly children: React.ReactNode;
}

export function AuthSwitchLink({
  prompt,
  path,
  next,
  children,
}: AuthSwitchLinkProps): React.JSX.Element {
  return (
    <p className="text-center text-sm text-muted-foreground">
      {prompt}{' '}
      <Link
        href={authPageHref(path, next)}
        className="font-medium text-foreground underline underline-offset-4"
        onMouseDown={handleKeepFieldFocus}
      >
        {children}
      </Link>
    </p>
  );
}
