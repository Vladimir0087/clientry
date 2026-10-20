import { column } from '../support/board.js';
import { expect, test } from '../support/fixtures.js';

const OPEN_STAGES = ['New', 'Call', 'Proposal sent', 'Contract'];
const DEMO_OWNER_EMAIL = 'ann@pixel-studio.example';

// The demo is shared with the other tests and with each other: these tests only read.
test.describe('demo', () => {
  test('should open the filled studio as its owner when the visitor explores the demo', async ({
    page,
  }) => {
    await page.goto('/login');

    await page.getByRole('button', { name: 'Explore the demo' }).click();

    await expect(page.getByText(/shared demo as Ann Carter, the owner/)).toBeVisible();
    await expect(page.getByRole('group', { name: 'Open deals' })).toContainText('$');
    // Early on the first of a month the demo may have no win yet, so the tile only has to load.
    await expect(page.getByRole('group', { name: 'Won this month' })).toContainText(/\d/);
    await expect(page.getByRole('group', { name: 'Win rate' })).toContainText('%');
    await expect(page.getByRole('group', { name: 'Overdue tasks' })).toContainText(/of \d+ open/);
    await expect(page.getByRole('table', { name: 'Open deals by stage' })).toBeAttached();
    await expect(page.getByRole('table', { name: 'Won and lost deals by month' })).toBeAttached();
    await expect(
      page.getByRole('region', { name: 'Activity' }).getByRole('listitem').first(),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'Notifications, 2 unread' })).toBeVisible();
    await page.goto('/deals');
    for (const stage of OPEN_STAGES) {
      await expect(column(page, stage).getByRole('listitem').first()).toBeVisible();
    }
  });

  test('should open the studio as a manager when the visitor picks it', async ({ page }) => {
    await page.goto('/login');

    await page.getByRole('button', { name: 'or see it as a manager' }).click();

    await expect(page.getByText(/shared demo as Max Novak, a manager/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Notifications, 1 unread' })).toBeVisible();
    await page.goto('/deals');
    await expect(page.getByRole('heading', { level: 1, name: 'Deals' })).toBeVisible();
    // The banner, like the link, waits for the session.
    await expect(page.getByText(/shared demo as Max Novak, a manager/)).toBeVisible();
    await expect(page.getByRole('link', { name: 'Edit stages' })).toBeHidden();
  });

  test('should show the team without owner controls in the demo', async ({ page, demoOwner }) => {
    await page.goto('/team');

    const members = page.getByRole('table');
    for (const name of ['Ann Carter', 'Max Novak', 'Sofia Reyes', 'Liam Brooks', 'Nina Petrova']) {
      await expect(members).toContainText(name);
    }
    await expect(page.getByText(/are turned off in the demo\.$/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Rename' })).toBeHidden();
    await expect(page.getByRole('button', { name: 'Invite member' })).toBeHidden();
    await expect(page.getByRole('heading', { name: 'Pending invites' })).toBeHidden();
  });

  test('should refuse a password login with a demo email like a wrong password', async ({
    page,
  }) => {
    await page.goto('/login');
    await page.getByLabel('Email').fill(DEMO_OWNER_EMAIL);
    await page.getByLabel('Password', { exact: true }).fill('a guess at the demo password');

    await page.getByRole('button', { name: 'Log in', exact: true }).click();

    await expect(
      page.getByRole('alert').filter({ hasText: 'Email or password is incorrect.' }),
    ).toBeVisible();
    await expect(page).toHaveURL(/\/login$/);
  });
});
