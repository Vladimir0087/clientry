import type { Page } from '@playwright/test';

export interface RecordedRequest {
  readonly method: string;
  readonly path: string;
}

// Every API request the page sends from now on, in order; one a navigation cuts off counts too.
export function recordApiRequests(page: Page): readonly RecordedRequest[] {
  const requests: RecordedRequest[] = [];
  page.on('request', (request) => {
    const { pathname } = new URL(request.url());
    if (pathname.startsWith('/api/')) {
      requests.push({ method: request.method(), path: pathname });
    }
  });
  return requests;
}
