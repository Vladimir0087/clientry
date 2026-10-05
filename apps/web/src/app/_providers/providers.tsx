'use client';

import { environmentManager, QueryClientProvider } from '@tanstack/react-query';
import type { QueryClient } from '@tanstack/react-query';
import { ThemeProvider } from 'next-themes';
import type { ReactNode } from 'react';

import { createQueryClient } from '@/shared/api/query-client';
import { Toaster } from '@/shared/ui/sonner';

import { handleSessionExpired } from './handle-session-expired';

let browserQueryClient: QueryClient | undefined;

// One per request on the server; one per tab in the browser, kept even if a render suspends.
function getQueryClient(): QueryClient {
  if (environmentManager.isServer()) {
    return createQueryClient();
  }
  browserQueryClient ??= createQueryClient({
    onSessionExpired: () => {
      void handleSessionExpired();
    },
  });
  return browserQueryClient;
}

interface ProvidersProps {
  readonly nonce: string | undefined;
  readonly children: ReactNode;
}

export function Providers({ nonce, children }: ProvidersProps): ReactNode {
  return (
    <QueryClientProvider client={getQueryClient()}>
      <ThemeProvider
        attribute="class"
        defaultTheme="system"
        enableSystem
        disableTransitionOnChange
        nonce={nonce}
      >
        {children}
        <Toaster />
      </ThemeProvider>
    </QueryClientProvider>
  );
}
