import { test as base } from '@playwright/test';
import type { Page } from '@playwright/test';

import type { SessionResponse } from '@clientry/shared/auth';

import { register, startDemo } from './api.js';
import { visitorHeaders } from './visitor-address.js';

interface Fixtures {
  // A fresh account with an empty workspace of its own; the page is signed in as its owner.
  readonly owner: SessionResponse;
  // The page is signed in to the shared demo as Ann, its owner; tests that use it only read.
  readonly demoOwner: SessionResponse;
  // Another visitor in a context of their own, signed out.
  readonly secondVisitor: Page;
}

export const test = base.extend<Fixtures>({
  // Every context is its own visitor, with its own budget under the auth rate limits.
  extraHTTPHeaders: async ({ extraHTTPHeaders }, use) => {
    await use({ ...extraHTTPHeaders, ...visitorHeaders() });
  },
  owner: async ({ page }, use) => {
    await use(await register(page.request));
  },
  demoOwner: async ({ page }, use) => {
    await use(await startDemo(page.request, 'owner'));
  },
  secondVisitor: async ({ browser }, use) => {
    const context = await browser.newContext({ extraHTTPHeaders: visitorHeaders() });
    await use(await context.newPage());
    await context.close();
  },
});

export { expect } from '@playwright/test';
