import { QueryClientProvider } from '@tanstack/react-query';
import type { QueryClient } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import type { RenderResult } from '@testing-library/react';
import { ThemeProvider } from 'next-themes';
import { NuqsTestingAdapter } from 'nuqs/adapters/testing';
import type { UrlUpdateEvent } from 'nuqs/adapters/testing';
import type { ReactNode } from 'react';

import { createQueryClient } from '@/shared/api/query-client';
import { Toaster } from '@/shared/ui/sonner';

export interface ProvidersRenderResult extends RenderResult {
  readonly queryClient: QueryClient;
}

interface TestProvidersProps {
  readonly queryClient: QueryClient;
  readonly children: ReactNode;
}

function TestProviders({ queryClient, children }: TestProvidersProps): ReactNode {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
        {children}
        <Toaster />
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export function renderWithProviders(
  ui: ReactNode,
  queryClient: QueryClient = createQueryClient(),
): ProvidersRenderResult {
  const result = render(<TestProviders queryClient={queryClient}>{ui}</TestProviders>);
  // rerender keeps the providers, so the query cache and the toasts survive it.
  const rerender = (next: ReactNode): void => {
    result.rerender(<TestProviders queryClient={queryClient}>{next}</TestProviders>);
  };
  return { ...result, rerender, queryClient };
}

export interface UrlRenderResult extends ProvidersRenderResult {
  // Every URL write, in order, with the options it was made with.
  readonly urlUpdates: UrlUpdateEvent[];
  // Puts a new URL in place from outside the app, as Back does.
  readonly navigate: (search: string) => void;
}

// The app's URL state lives in nuqs; this adapter keeps it in memory.
export function renderWithUrl(
  ui: ReactNode,
  search = '',
  queryClient: QueryClient = createQueryClient(),
): UrlRenderResult {
  const urlUpdates: UrlUpdateEvent[] = [];
  const handleUrlUpdate = (event: UrlUpdateEvent): void => {
    urlUpdates.push(event);
  };
  const tree = (searchParams: string): ReactNode => (
    <TestProviders queryClient={queryClient}>
      <NuqsTestingAdapter hasMemory searchParams={searchParams} onUrlUpdate={handleUrlUpdate}>
        {ui}
      </NuqsTestingAdapter>
    </TestProviders>
  );
  const result = render(tree(search));
  return {
    ...result,
    queryClient,
    urlUpdates,
    navigate: (next) => {
      result.rerender(tree(next));
    },
  };
}
