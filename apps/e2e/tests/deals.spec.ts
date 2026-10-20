import { createClient } from '../support/api.js';
import { arrangeDeal, column, dragHandle, dragWithMouse } from '../support/board.js';
import { expect, test } from '../support/fixtures.js';

test.describe('deals', () => {
  test('should show a new deal in New with its client and amount', async ({ page, owner }) => {
    await createClient(page.request, { name: 'Romashka LLC', company: 'Romashka' });
    await page.goto('/deals');
    await page.getByRole('link', { name: 'New deal' }).click();
    await page.getByLabel('Title').fill('Landing page for Romashka');
    await page.getByRole('combobox', { name: 'Client' }).click();
    await page.getByRole('option', { name: /^Romashka LLC/ }).click();
    await page.getByLabel('Amount').fill('1500');

    await page.getByRole('button', { name: 'Create deal' }).click();

    await expect(
      page.getByRole('heading', { level: 1, name: 'Landing page for Romashka' }),
    ).toBeVisible();
    await page.goto('/deals');
    const card = column(page, 'New')
      .getByRole('listitem')
      .filter({ has: page.getByRole('link', { name: 'Landing page for Romashka' }) });
    await expect(card).toContainText('Romashka LLC');
    await expect(card).toContainText('$1,500');
  });

  test('should keep a deal in its new stage after a reload when it is dragged with the mouse', async ({
    page,
    owner,
  }) => {
    await arrangeDeal(page, owner, { title: 'Mobile app' });
    await page.goto('/deals');
    const moved = page.waitForResponse(
      (response) => response.url().endsWith('/move') && response.status() === 200,
    );

    await dragWithMouse(page, await dragHandle(page, 'Mobile app'), column(page, 'Call'));
    await moved;
    await page.reload();

    const link = column(page, 'Call').getByRole('link', { name: 'Mobile app' });
    await expect(link).toBeVisible();
    await link.click();
    await expect(page.getByRole('region', { name: 'History' })).toContainText(
      `${owner.user.name} moved the deal from New to Call`,
    );
  });

  test('should move a deal when the keyboard is used: Space, an arrow, Space', async ({
    page,
    owner,
  }) => {
    await arrangeDeal(page, owner, { title: 'Brand book' });
    await page.goto('/deals');
    const status = page.getByRole('status');

    await (await dragHandle(page, 'Brand book')).focus();
    await page.keyboard.press('Space');
    await expect(status.filter({ hasText: 'Picked up Brand book in New.' })).toBeAttached();
    await page.keyboard.press('ArrowRight');
    await expect(status.filter({ hasText: 'Brand book is in Call' })).toBeAttached();
    await page.keyboard.press('Space');

    await expect(status.filter({ hasText: 'Dropped Brand book in Call.' })).toBeAttached();
    await expect(column(page, 'Call').getByRole('link', { name: 'Brand book' })).toBeVisible();
    await page.reload();
    await expect(column(page, 'Call').getByRole('link', { name: 'Brand book' })).toBeVisible();
  });

  test('should return the card to its column with an error toast when the server rejects the move', async ({
    page,
    owner,
  }) => {
    await arrangeDeal(page, owner, { title: 'Online shop' });
    await page.route('**/api/deals/*/move', (route) =>
      route.fulfill({
        status: 409,
        contentType: 'application/problem+json',
        body: JSON.stringify({
          type: 'about:blank',
          title: 'Conflict',
          status: 409,
          code: 'BOARD_CHANGED',
          detail: 'The board changed',
          requestId: 'e2e',
        }),
      }),
    );
    await page.goto('/deals');

    await (await dragHandle(page, 'Online shop')).focus();
    await page.keyboard.press('Space');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Space');

    await expect(page.getByText('The board changed. Try again.')).toBeVisible();
    await expect(column(page, 'New').getByRole('link', { name: 'Online shop' })).toBeVisible();
    await expect(column(page, 'Call').getByRole('link', { name: 'Online shop' })).toBeHidden();
  });

  test('should mark a deal won when it is moved to Paid', async ({ page, owner }) => {
    await arrangeDeal(page, owner, { title: 'Corporate site', stage: 'Contract' });
    await page.goto('/deals');
    await dragHandle(page, 'Corporate site');

    await page.getByRole('button', { name: 'Actions for Corporate site' }).click();
    await page.getByRole('menuitemradio', { name: 'Paid' }).click();

    const card = column(page, 'Paid')
      .getByRole('listitem')
      .filter({ has: page.getByRole('link', { name: 'Corporate site' }) });
    await expect(column(page, 'Paid')).toContainText('Won');
    await expect(card).toContainText('Closed');
    await card.getByRole('link', { name: 'Corporate site' }).click();
    await expect(page.getByRole('combobox', { name: 'Stage' })).toHaveText('Paid');
    await expect(page.getByText(/^Closed on /)).toBeVisible();
  });
});
