import type { Page } from '@playwright/test';

import { column } from '../support/board.js';
import { expect, test } from '../support/fixtures.js';
import {
  BOARD,
  CLIENT,
  CLIENT_LIST,
  DASHBOARD,
  DEAL,
  openScreen,
  TASK_LIST,
  TEAM,
} from '../support/screens.js';
import type { Screen } from '../support/screens.js';

const DEMO_PAGES: readonly Screen[] = [
  DASHBOARD,
  CLIENT_LIST,
  CLIENT,
  BOARD,
  DEAL,
  TASK_LIST,
  TEAM,
];

function pageScrollsSideways(page: Page): Promise<boolean> {
  return page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
}

test.describe('phone', () => {
  test('should fit the whole login card, the demo entry included, without scrolling', async ({
    page,
  }) => {
    await page.goto('/login');

    await expect(
      page.getByRole('heading', { level: 1, name: 'Log in to Clientry' }),
    ).toBeInViewport({ ratio: 1 });
    await expect(page.getByRole('button', { name: 'Explore the demo' })).toBeInViewport({
      ratio: 1,
    });
    await expect(page.getByRole('button', { name: 'or see it as a manager' })).toBeInViewport({
      ratio: 1,
    });
  });

  test('should not scroll sideways on any page of the demo', async ({ page, demoOwner }) => {
    for (const screen of DEMO_PAGES) {
      await test.step(screen.name, async () => {
        await openScreen(page, screen);

        expect(await pageScrollsSideways(page)).toBe(false);
      });
    }
  });

  test('should scroll the board sideways inside its own container', async ({ page, demoOwner }) => {
    await page.goto('/deals');
    const lost = column(page, 'Lost');
    await expect(column(page, 'New')).toBeInViewport();
    await expect(lost).not.toBeInViewport();

    await lost.scrollIntoViewIfNeeded();

    await expect(lost).toBeInViewport();
    expect(await pageScrollsSideways(page)).toBe(false);
    expect(await page.evaluate(() => window.scrollX)).toBe(0);
  });
});
