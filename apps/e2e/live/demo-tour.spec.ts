import { expect, test } from '@playwright/test';

// Read-only: the live demo is shared with visitors. The tour's own session ends with its logout.
test.describe('live demo tour', () => {
  test('should show the demo and log out', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByRole('heading', { level: 1, name: 'Log in to Clientry' })).toBeVisible();

    await page.getByRole('button', { name: 'Explore the demo' }).click();
    await expect(page.getByText(/shared demo as Ann Carter, the owner/)).toBeVisible();
    await expect(page.getByRole('group', { name: 'Open deals' })).toContainText('$');
    // Visitors can change the deals and tasks, so the tiles only have to load, with no set values.
    await expect(page.getByRole('group', { name: 'Won this month' })).toContainText(/\d/);
    await expect(page.getByRole('group', { name: 'Overdue tasks' })).toContainText(/of \d+ open/);
    // Visitors share the demo and may have read every notification, so the count is optional.
    await expect(
      page.getByRole('button', { name: /^Notifications(, \d+ unread)?$/ }),
    ).toBeVisible();

    await page
      .getByRole('navigation', { name: 'Main' })
      .getByRole('link', { name: 'Deals' })
      .click();
    await expect(page.getByRole('button', { name: /^Drag / }).first()).toBeVisible();

    await page.getByRole('button', { name: 'Account' }).click();
    await page.getByRole('menuitem', { name: 'Log out' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Log in to Clientry' })).toBeVisible();
  });
});
