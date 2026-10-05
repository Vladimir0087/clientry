'use client';

import { GeistSans } from 'geist/font/sans';
import { ThemeProvider } from 'next-themes';
import type { ReactNode } from 'react';

import { Button } from '@/shared/ui/button';

import { StatusPage } from './_components/status-page';
import './globals.css';

interface GlobalErrorProps {
  // Unlike reset, retry refetches the server payload that failed.
  readonly retry: () => void;
}

// Replaces the root layout, so it brings its own document, styles and theme.
export default function GlobalError({ retry }: GlobalErrorProps): ReactNode {
  return (
    <html lang="en" className={GeistSans.variable} suppressHydrationWarning>
      <body>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          <StatusPage title="Something went wrong">
            <Button variant="outline" onClick={retry}>
              Try again
            </Button>
          </StatusPage>
        </ThemeProvider>
      </body>
    </html>
  );
}
