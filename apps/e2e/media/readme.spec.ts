import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { devices } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import sharp from 'sharp';

import { firstClientId } from '../support/api.js';
import { column, dragHandle } from '../support/board.js';
import { expect, test } from '../support/fixtures.js';
import { drawPointer } from '../support/pointer.js';
import { startRecording } from '../support/recorder.js';
import { BOARD, CLIENT, DASHBOARD, LOGIN, openScreen, TASK_LIST } from '../support/screens.js';
import type { Screen } from '../support/screens.js';

const MEDIA_DIR = fileURLToPath(new URL('../../../docs/media/', import.meta.url));
const STILL_BUDGET = 400_000;
const GIF_BUDGET = 5_000_000;
const GIF_WIDTH = 960;

const DRAGGED_DEAL = 'Tutor booking for Lighthouse';

// A client with notes, deals and an open task of its own.
const NORTHWIND: Screen = {
  ...CLIENT,
  path: async (page) => `/clients/${await firstClientId(page.request, 'Northwind')}`,
};

async function save(name: string, file: Buffer): Promise<number> {
  await mkdir(MEDIA_DIR, { recursive: true });
  await writeFile(`${MEDIA_DIR}${name}`, file);
  return file.byteLength;
}

async function saveStill(page: Page, name: string): Promise<number> {
  const png = await sharp(await page.screenshot())
    .png({ palette: true, compressionLevel: 9, effort: 10 })
    .toBuffer();
  return save(name, png);
}

// The viewer's time to look; the frames keep their real timing.
function hold(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// The charts are hidden from assistive technology, so their bars are found by recharts' class.
function chartBar(page: Page, chart: string): Locator {
  return page.getByRole('figure', { name: chart }).locator('.recharts-bar-rectangle').first();
}

async function expectDashboardDrawn(page: Page): Promise<void> {
  await expect(DASHBOARD.ready(page)).toBeVisible();
  await expect(chartBar(page, 'Pipeline')).toBeVisible();
  await expect(chartBar(page, 'Won deals, last 6 months')).toBeVisible();
  await expect(
    page.getByRole('region', { name: 'Activity' }).getByRole('listitem').first(),
  ).toBeVisible();
}

// A swipe on a phone: the board snaps the stage to its start, and the next one peeks in.
async function swipeBoardTo(page: Page, stage: string): Promise<void> {
  const target = column(page, stage);
  await target.evaluate((element) => {
    let board = element.parentElement;
    while (board !== null && getComputedStyle(board).overflowX !== 'auto') {
      board = board.parentElement;
    }
    board?.scrollBy({
      left: element.getBoundingClientRect().left - board.getBoundingClientRect().left,
    });
  });
  await expect.poll(async () => (await target.boundingBox())?.x).toBeLessThan(20);
}

// Every file is replaced on each run; the tour runs last, since it moves a deal.
test.describe('readme stills', () => {
  // The charts draw at once instead of growing in.
  test.use({ reducedMotion: 'reduce' });

  test('should capture the dashboard', async ({ page, demoOwner }) => {
    await page.goto('/');
    await expectDashboardDrawn(page);

    expect(await saveStill(page, 'dashboard.png')).toBeLessThan(STILL_BUDGET);
  });

  test('should capture a client', async ({ page, demoOwner }) => {
    await openScreen(page, NORTHWIND);
    await expect(page.getByRole('link', { name: 'Ask Northwind for a testimonial' })).toBeVisible();

    expect(await saveStill(page, 'client.png')).toBeLessThan(STILL_BUDGET);
  });

  test.describe('in the dark theme', () => {
    test.use({ colorScheme: 'dark' });

    test('should capture the board', async ({ page, demoOwner }) => {
      await openScreen(page, BOARD);

      expect(await saveStill(page, 'board.png')).toBeLessThan(STILL_BUDGET);
    });

    test('should capture the tasks', async ({ page, demoOwner }) => {
      await openScreen(page, TASK_LIST);

      expect(await saveStill(page, 'tasks.png')).toBeLessThan(STILL_BUDGET);
    });
  });

  test.describe('on a phone', () => {
    test.use({
      userAgent: devices['Pixel 7'].userAgent,
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
    });

    test('should capture the board', async ({ page, demoOwner }) => {
      await openScreen(page, BOARD);
      await swipeBoardTo(page, 'Call');

      expect(await saveStill(page, 'phone.png')).toBeLessThan(STILL_BUDGET);
    });
  });

  test.describe('for link previews', () => {
    test.use({ viewport: { width: 1280, height: 640 } });

    test('should capture the social preview', async ({ page, demoOwner }) => {
      await page.goto('/');
      await expectDashboardDrawn(page);

      expect(await saveStill(page, 'social-preview.png')).toBeLessThan(STILL_BUDGET);
    });
  });
});

test.describe('readme tour', () => {
  test('should record the tour', async ({ page }) => {
    const pointer = await drawPointer(page, { x: 1000, y: 600 });
    await openScreen(page, LOGIN);
    const recording = await startRecording(page);
    await hold(600);

    await pointer.click(LOGIN.ready(page));
    await expectDashboardDrawn(page);
    await hold(1600);

    await pointer.click(
      page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Deals' }),
    );
    const handle = await dragHandle(page, DRAGGED_DEAL);
    await hold(700);
    const moved = page.waitForResponse((response) => response.url().endsWith('/move'));
    await pointer.drag(handle, column(page, 'Proposal sent').getByRole('listitem').first());
    expect((await moved).status()).toBe(200);
    await hold(500);

    await pointer.click(column(page, 'Proposal sent').getByRole('link', { name: DRAGGED_DEAL }));
    const history = page.getByRole('region', { name: 'History' });
    await expect(history).toContainText('Ann Carter moved the deal from Call to Proposal sent');
    await pointer.moveTo(history.getByRole('listitem').first());
    await hold(1200);

    await pointer.click(page.getByRole('button', { name: /^Notifications, \d+ unread$/ }));
    await expect(
      page.getByRole('dialog', { name: 'Notifications' }).getByRole('link').first(),
    ).toBeVisible();
    await hold(1800);

    expect(await save('demo.gif', await recording.toGif(GIF_WIDTH))).toBeLessThan(GIF_BUDGET);
  });
});
