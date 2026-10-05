import { QueryClientProvider } from '@tanstack/react-query';
import type { QueryClient } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import type { RenderResult } from '@testing-library/react';
import { ThemeProvider } from 'next-themes';
import type { ReactNode } from 'react';

import { createQueryClient } from '@/shared/api/query-client';
import { Toaster } from '@/shared/ui/sonner';

export interface ProvidersRenderResult extends RenderResult {
  readonly queryClient: QueryClient;
}

export function renderWithProviders(
  ui: ReactNode,
  queryClient: QueryClient = createQueryClient(),
): ProvidersRenderResult {
  const result = render(
    <QueryClientProvider client={queryClient}>
      <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
        {ui}
        <Toaster />
      </ThemeProvider>
    </QueryClientProvider>,
  );
  return { ...result, queryClient };
}
