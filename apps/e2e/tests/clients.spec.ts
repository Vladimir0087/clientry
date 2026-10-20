import { createClient } from '../support/api.js';
import { expect, test } from '../support/fixtures.js';

test.describe('clients', () => {
  test("should open the client's card when the form is filled", async ({ page, owner }) => {
    await page.goto('/clients/new');
    await page.getByLabel('Name', { exact: true }).fill('Anna Petrova');
    await page.getByLabel('Company').fill('Romashka LLC');
    await page.getByLabel('Email').fill('anna@romashka.example');
    await page.getByLabel('Phone').fill('+1 555 0100');
    await page.getByRole('combobox', { name: 'Source' }).click();
    await page.getByRole('option', { name: 'Telegram' }).click();
    // A combobox: the input suggests the workspace's tags.
    const tags = page.getByRole('combobox', { name: 'Tags' });
    await tags.fill('vip');
    await tags.press('Enter');
    await tags.fill('wholesale');
    await tags.press('Enter');
    await page.getByLabel('Notes').fill('Wants a landing page by May.');

    await page.getByRole('button', { name: 'Create client' }).click();

    await expect(page.getByRole('heading', { level: 1, name: 'Anna Petrova' })).toBeVisible();
    const main = page.getByRole('main');
    await expect(main.getByText('Romashka LLC')).toBeVisible();
    await expect(main.getByRole('link', { name: 'anna@romashka.example' })).toBeVisible();
    await expect(main.getByRole('link', { name: '+1 555 0100' })).toBeVisible();
    await expect(main.getByText('Telegram', { exact: true })).toBeVisible();
    await expect(main.getByRole('link', { name: 'vip', exact: true })).toBeVisible();
    await expect(main.getByRole('link', { name: 'wholesale', exact: true })).toBeVisible();
    await expect(main.getByText('Wants a landing page by May.')).toBeVisible();
    await expect(main.getByText(`Added by ${owner.user.name}`)).toBeVisible();
  });

  test('should show field errors when the form is invalid', async ({ page, owner }) => {
    await page.goto('/clients/new');
    await page.getByLabel('Email').fill('not-an-email');
    await page.getByLabel('Phone').fill('call me');
    // Leaving the field shows its error first, so the button stays where the click lands.
    await page.getByLabel('Phone').blur();

    await page.getByRole('button', { name: 'Create client' }).click();

    await expect(page.getByLabel('Name', { exact: true })).toHaveAccessibleDescription(
      'Enter a name',
    );
    await expect(page.getByLabel('Email')).toHaveAccessibleDescription('Enter a valid email');
    await expect(page.getByLabel('Phone')).toHaveAccessibleDescription(
      'Enter a valid phone number',
    );
    await expect(page).toHaveURL(/\/clients\/new$/);
  });

  test('should keep search and the tag filter in the URL after a reload and Back', async ({
    page,
    owner,
  }) => {
    await createClient(page.request, { name: 'Alpha Agency', tags: ['vip'] });
    await createClient(page.request, { name: 'Beta Bakery', tags: ['vip'] });
    await createClient(page.request, { name: 'Gamma Garage', tags: [] });
    const alpha = page.getByRole('link', { name: 'Alpha Agency' });
    const beta = page.getByRole('link', { name: 'Beta Bakery' });
    const gamma = page.getByRole('link', { name: 'Gamma Garage' });
    await page.goto('/clients');
    await expect(gamma).toBeVisible();

    await page.getByRole('button', { name: /^Tags/ }).click();
    await page.getByRole('menuitemcheckbox', { name: /^vip/ }).click();
    await page.keyboard.press('Escape');
    await expect(gamma).toBeHidden();
    await page.getByRole('searchbox', { name: 'Search clients' }).fill('Beta');
    await expect(alpha).toBeHidden();
    await expect(page).toHaveURL(/[?&]q=Beta(&|$)/);
    await expect(page).toHaveURL(/[?&]tags=vip(&|$)/);

    await page.reload();
    await expect(page.getByRole('searchbox', { name: 'Search clients' })).toHaveValue('Beta');
    await expect(page.getByRole('button', { name: /^Tags.*, 1 selected$/ })).toBeVisible();
    await expect(beta).toBeVisible();
    await expect(alpha).toBeHidden();

    await beta.click();
    await expect(page.getByRole('heading', { level: 1, name: 'Beta Bakery' })).toBeVisible();
    await page.goBack();
    await expect(page.getByRole('searchbox', { name: 'Search clients' })).toHaveValue('Beta');
    await expect(beta).toBeVisible();
    await expect(alpha).toBeHidden();
    await expect(gamma).toBeHidden();
  });
});
