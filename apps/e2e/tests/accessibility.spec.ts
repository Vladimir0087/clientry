import type { Page } from '@playwright/test';

import { findSeriousViolations } from '../support/axe.js';
import { expect, test } from '../support/fixtures.js';
import {
  BOARD,
  CLIENT_FORM,
  CLIENT_LIST,
  DASHBOARD,
  DEAL,
  LOGIN,
  openScreen,
  REGISTER,
  TASK_FORM,
  TASK_LIST,
  TEAM,
} from '../support/screens.js';
import type { Screen } from '../support/screens.js';

const SIGNED_OUT: readonly Screen[] = [LOGIN, REGISTER];

const DEMO_OWNER: readonly Screen[] = [
  DASHBOARD,
  CLIENT_LIST,
  CLIENT_FORM,
  BOARD,
  DEAL,
  TASK_LIST,
  TASK_FORM,
  TEAM,
];

const COLOR_SCHEMES = ['light', 'dark'] as const;

type ColorScheme = (typeof COLOR_SCHEMES)[number];

async function expectNoSeriousViolations(
  page: Page,
  screen: Screen,
  colorScheme: ColorScheme,
): Promise<void> {
  await openScreen(page, screen);
  // next-themes marks the root with the scheme it resolved, so a scan never checks the wrong theme.
  await expect(page.locator('html')).toContainClass(colorScheme);

  expect(await findSeriousViolations(page)).toEqual([]);
}

for (const colorScheme of COLOR_SCHEMES) {
  test.describe(`accessibility in the ${colorScheme} theme`, () => {
    test.use({ colorScheme });

    for (const screen of SIGNED_OUT) {
      test(`should report no serious or critical violations on ${screen.name}`, async ({
        page,
      }) => {
        await expectNoSeriousViolations(page, screen, colorScheme);
      });
    }

    // The demo owner has data on every page, and a scan only reads.
    for (const screen of DEMO_OWNER) {
      test(`should report no serious or critical violations on ${screen.name}`, async ({
        page,
        demoOwner,
      }) => {
        await expectNoSeriousViolations(page, screen, colorScheme);
      });
    }
  });
}
