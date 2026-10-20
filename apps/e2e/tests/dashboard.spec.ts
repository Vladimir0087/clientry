import { findStage, moveDeal } from '../support/api.js';
import { arrangeDeal } from '../support/board.js';
import { expect, test } from '../support/fixtures.js';

test.describe('dashboard', () => {
  test("should reflect the workspace's deals in the tiles, the won chart and the feed", async ({
    page,
    owner,
  }) => {
    await arrangeDeal(page, owner, { title: 'Landing page', amount: 100_000 });
    await arrangeDeal(page, owner, { title: 'Mobile app', amount: 200_000, clientName: 'Acme' });
    const won = await arrangeDeal(page, owner, {
      title: 'Online shop',
      amount: 300_000,
      clientName: 'Globex',
    });
    const paid = await findStage(page.request, 'Paid');
    await moveDeal(page.request, won.id, { version: won.version, stageId: paid.id, afterId: null });

    await page.goto('/');

    await expect(page.getByRole('group', { name: 'Open deals' })).toHaveText(
      /^Open deals\s*2\s*\$3,000$/,
    );
    await expect(page.getByRole('group', { name: 'Won this month' })).toContainText('$3,000');
    await expect(page.getByRole('heading', { name: /^Won deals.*last 6 months$/ })).toBeVisible();
    await expect(page.getByText('No deals won in the last 6 months.')).toBeHidden();
    await expect(page.getByRole('table', { name: 'Won and lost deals by month' })).toBeAttached();
    const feed = page.getByRole('region', { name: 'Activity' });
    await expect(feed).toContainText(`${owner.user.name} moved Online shop from New to Paid`);
    await expect(feed).toContainText(`${owner.user.name} created the deal Landing page in New`);
  });
});
