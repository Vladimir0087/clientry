import { GeistSans } from 'geist/font/sans';
import type { Metadata } from 'next';
import { headers } from 'next/headers';
import type { ReactNode } from 'react';

import { NONCE_HEADER } from '@/shared/lib/nonce';

import { Providers } from './_providers/providers';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'Clientry', template: '%s · Clientry' },
};

interface RootLayoutProps {
  readonly children: ReactNode;
}

// Reading the nonce renders every page per request, which a nonce CSP needs anyway.
export default async function RootLayout({ children }: RootLayoutProps): Promise<ReactNode> {
  const nonce = (await headers()).get(NONCE_HEADER) ?? undefined;
  return (
    // next-themes sets the theme class before React hydrates.
    <html lang="en" className={GeistSans.variable} suppressHydrationWarning>
      <body>
        <Providers nonce={nonce}>{children}</Providers>
      </body>
    </html>
  );
}
