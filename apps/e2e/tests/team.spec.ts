import { createClient, createInvite, joinByInvite, PASSWORD, uniqueEmail } from '../support/api.js';
import { column } from '../support/board.js';
import { expect, test } from '../support/fixtures.js';

test.describe('team', () => {
  test("should let a manager join when a second visitor opens the owner's invite link and registers", async ({
    page,
    owner,
    secondVisitor,
  }) => {
    await page.goto('/team');
    await page.getByRole('button', { name: 'Invite member' }).click();
    await page.getByRole('button', { name: 'Create link' }).click();
    const link = await page.getByRole('textbox', { name: 'Invite link' }).inputValue();

    await secondVisitor.goto(link);
    await expect(
      secondVisitor.getByRole('heading', { level: 1, name: `Join ${owner.workspace.name}` }),
    ).toBeVisible();
    await secondVisitor.getByLabel('Your name').fill('Mia Manager');
    await secondVisitor.getByLabel('Email').fill(uniqueEmail('manager'));
    await secondVisitor.getByLabel('Password', { exact: true }).fill(PASSWORD);
    await secondVisitor.getByRole('button', { name: 'Create account and join' }).click();
    await expect(secondVisitor.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeVisible();

    await page.getByRole('button', { name: 'Done' }).click();
    await page.reload();
    const row = page.getByRole('row').filter({ hasText: 'Mia Manager' });
    await expect(row.getByRole('cell', { name: 'Manager', exact: true })).toBeVisible();
  });

  test('should limit the joined manager to the role table', async ({
    page,
    owner,
    secondVisitor,
  }) => {
    const { token } = await createInvite(page.request);
    await joinByInvite(secondVisitor.request, token, 'Mia Manager');
    const ownersClient = await createClient(page.request, { name: 'Owner Client' });
    const managersClient = await createClient(secondVisitor.request, { name: 'Manager Client' });

    await secondVisitor.goto('/deals');
    await expect(secondVisitor.getByRole('heading', { level: 1, name: 'Deals' })).toBeVisible();
    // The workspace name, like the link, waits for the session.
    await expect(secondVisitor.getByRole('banner').getByText(owner.workspace.name)).toBeVisible();
    await expect(secondVisitor.getByRole('link', { name: 'Edit stages' })).toBeHidden();
    await secondVisitor.goto('/team');
    await expect(
      secondVisitor.getByText('Only owners can invite people and change roles.'),
    ).toBeVisible();
    await expect(secondVisitor.getByRole('row').filter({ hasText: owner.user.name })).toBeVisible();
    await expect(secondVisitor.getByRole('button', { name: /^Actions for/ })).toHaveCount(0);
    await expect(secondVisitor.getByRole('button', { name: 'Invite member' })).toBeHidden();
    await expect(secondVisitor.getByRole('button', { name: 'Rename' })).toBeHidden();
    await secondVisitor.goto(`/clients/${managersClient.id}`);
    await expect(secondVisitor.getByRole('button', { name: 'Delete' })).toBeVisible();
    await secondVisitor.goto(`/clients/${ownersClient.id}`);
    await expect(
      secondVisitor.getByRole('heading', { level: 1, name: 'Owner Client' }),
    ).toBeVisible();
    // As above, the button waits for the session.
    await expect(secondVisitor.getByRole('banner').getByText(owner.workspace.name)).toBeVisible();
    await expect(secondVisitor.getByRole('button', { name: 'Delete' })).toBeHidden();
  });

  test('should show a new stage on the board when the owner adds it in the stage settings', async ({
    page,
    owner,
  }) => {
    await page.goto('/deals');
    await page.getByRole('link', { name: 'Edit stages' }).click();

    await page.getByLabel('New stage').fill('Negotiation');
    await page.getByRole('button', { name: 'Add stage' }).click();
    await expect(page.getByRole('main').getByText('Negotiation', { exact: true })).toBeVisible();
    await page.getByRole('link', { name: 'Deals', exact: true }).first().click();

    await expect(column(page, 'Negotiation')).toBeVisible();
  });
});
