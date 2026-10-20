import { register } from '../support/api.js';
import { arrangeDeal } from '../support/board.js';
import { expect, test } from '../support/fixtures.js';

test.describe('tenancy', () => {
  test("should show not found when a user opens another workspace's deal or client by its URL", async ({
    page,
    owner,
    secondVisitor,
  }) => {
    const otherOwner = await register(secondVisitor.request, { workspaceName: 'Other Studio' });
    const deal = await arrangeDeal(secondVisitor, otherOwner, { title: 'Secret deal' });

    await page.goto(`/deals/${deal.id}`);
    await expect(page.getByRole('heading', { level: 1, name: 'Deal not found' })).toBeVisible();
    await page.goto(`/clients/${deal.client.id}`);
    await expect(page.getByRole('heading', { level: 1, name: 'Client not found' })).toBeVisible();
    await expect(page.getByText('Secret deal')).toBeHidden();
  });
});
