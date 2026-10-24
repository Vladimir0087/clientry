import { expect } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';

import { firstClientId, firstDealId } from './api.js';

export interface Screen {
  readonly name: string;
  readonly path: (page: Page) => Promise<string>;
  // Content that only shows once the page's data has loaded.
  readonly ready: (page: Page) => Locator;
}

function fixed(path: string): () => Promise<string> {
  return () => Promise.resolve(path);
}

// A list renders as a table and as cards, and CSS shows one of them by the viewport's width.
function firstEntry(page: Page): Locator {
  const main = page.getByRole('main');
  return main
    .getByRole('row')
    .nth(1)
    .or(main.getByRole('listitem'))
    .filter({ visible: true })
    .first();
}

export const LOGIN: Screen = {
  name: 'login',
  path: fixed('/login'),
  ready: (page) => page.getByRole('button', { name: 'Explore the demo' }),
};

export const REGISTER: Screen = {
  name: 'register',
  path: fixed('/register'),
  ready: (page) => page.getByRole('button', { name: 'Create account' }),
};

export const DASHBOARD: Screen = {
  name: 'the dashboard',
  path: fixed('/'),
  ready: (page) => page.getByRole('table', { name: 'Won and lost deals by month' }),
};

export const CLIENT_LIST: Screen = {
  name: 'the client list',
  path: fixed('/clients'),
  ready: firstEntry,
};

export const CLIENT_FORM: Screen = {
  name: 'the client form',
  path: fixed('/clients/new'),
  ready: (page) => page.getByRole('button', { name: 'Create client' }),
};

export const CLIENT: Screen = {
  name: 'a client',
  path: async (page) => `/clients/${await firstClientId(page.request)}`,
  ready: (page) => page.getByText(/^Added by /),
};

export const BOARD: Screen = {
  name: 'the board',
  path: fixed('/deals'),
  ready: (page) => page.getByRole('button', { name: /^Drag / }).first(),
};

export const DEAL: Screen = {
  name: 'a deal',
  path: async (page) => `/deals/${await firstDealId(page.request)}`,
  ready: (page) => page.getByRole('region', { name: 'History' }).getByRole('listitem').first(),
};

export const TASK_LIST: Screen = {
  name: 'the task list',
  path: fixed('/tasks'),
  ready: (page) => page.getByRole('checkbox').first(),
};

export const TASK_FORM: Screen = {
  name: 'the task form',
  path: fixed('/tasks/new'),
  ready: (page) => page.getByRole('button', { name: 'Create task' }),
};

export const TEAM: Screen = {
  name: 'team',
  path: fixed('/team'),
  ready: firstEntry,
};

export async function openScreen(page: Page, screen: Screen): Promise<void> {
  await page.goto(await screen.path(page));
  await expect(screen.ready(page)).toBeVisible();
  // Dates are written into their <time> only after hydration, so an empty one is a page still loading.
  await expect(page.locator('time:empty')).toHaveCount(0);
}
