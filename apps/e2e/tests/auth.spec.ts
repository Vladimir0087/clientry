import { expireAccessToken } from '../support/access-token.js';
import { PASSWORD, register, uniqueEmail } from '../support/api.js';
import { expect, test } from '../support/fixtures.js';
import { recordApiRequests } from '../support/network.js';

test.describe('auth', () => {
  test("should land on the dashboard with the user's name when a visitor registers through the form", async ({
    page,
  }) => {
    await page.goto('/register');
    await page.getByLabel('Your name').fill('Rita Rivers');
    await page.getByLabel('Workspace name').fill('Rivers Studio');
    await page.getByLabel('Email').fill(uniqueEmail('owner'));
    await page.getByLabel('Password', { exact: true }).fill(PASSWORD);

    await page.getByRole('button', { name: 'Create account' }).click();

    await expect(page.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeVisible();
    await page.getByRole('button', { name: 'Account', exact: true }).click();
    await expect(page.getByRole('menu')).toContainText('Rita Rivers');
  });

  test("should show the server's error on the email field when the email is taken", async ({
    page,
    request,
  }) => {
    const { user } = await register(request);
    await page.goto('/register');
    await page.getByLabel('Your name').fill('Second Owner');
    await page.getByLabel('Workspace name').fill('Second Studio');
    await page.getByLabel('Email').fill(user.email);
    await page.getByLabel('Password', { exact: true }).fill(PASSWORD);

    await page.getByRole('button', { name: 'Create account' }).click();

    const email = page.getByLabel('Email');
    await expect(email).toHaveAttribute('aria-invalid', 'true');
    await expect(email).toHaveAccessibleDescription(/An account with this email already exists\./);
  });

  test('should return to the requested page when a signed-out visitor follows a link and logs in', async ({
    page,
    request,
  }) => {
    const { user } = await register(request);

    await page.goto('/deals');
    await expect(page).toHaveURL(/\/login\?next=%2Fdeals$/);
    await page.getByLabel('Email').fill(user.email);
    await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
    await page.getByRole('button', { name: 'Log in', exact: true }).click();

    await expect(page).toHaveURL(/\/deals$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Deals' })).toBeVisible();
  });

  test('should keep the session when the access token has expired: opening a page renders it and refreshes once', async ({
    page,
    context,
    owner,
  }) => {
    // Before any page opens: an open page would send its own refresh, which a later load cuts off.
    await expireAccessToken(context);
    const requests = recordApiRequests(page);

    const refreshed = page.waitForResponse('**/api/auth/refresh');
    await page.goto('/clients');

    expect((await refreshed).status()).toBe(200);
    await expect(page.getByText('No clients yet')).toBeVisible();
    await page.getByRole('button', { name: 'Account', exact: true }).click();
    await expect(page.getByRole('menu')).toContainText(owner.user.name);
    expect(requests.filter(({ path }) => path === '/api/auth/refresh')).toHaveLength(1);
  });

  test('should end the session when the user logs out: /login, and Back stays signed out', async ({
    page,
    owner,
  }) => {
    await page.goto('/');
    await page.goto('/clients');
    await expect(page.getByRole('heading', { level: 1, name: 'Clients' })).toBeVisible();

    await page.getByRole('button', { name: 'Account', exact: true }).click();
    await expect(page.getByRole('menu')).toContainText(owner.user.email);
    await page.getByRole('menuitem', { name: 'Log out' }).click();
    await expect(page).toHaveURL(/\/login$/);
    await page.goBack();

    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByRole('heading', { level: 1, name: 'Log in to Clientry' })).toBeVisible();
  });

  test("should send no request after the logout's 204 when the user logs out from the dashboard", async ({
    page,
    owner,
  }) => {
    await page.goto('/');
    await expect(page.getByText('No activity yet.', { exact: false })).toBeVisible();
    await expect(page.getByText('No deals won in the last 6 months.')).toBeVisible();
    const requests = recordApiRequests(page);

    await page.getByRole('button', { name: 'Account', exact: true }).click();
    await expect(page.getByRole('menu')).toContainText(owner.user.email);
    const loggedOut = page.waitForResponse('**/api/auth/logout');
    await page.getByRole('menuitem', { name: 'Log out' }).click();

    expect((await loggedOut).status()).toBe(204);
    await expect(page.getByRole('heading', { level: 1, name: 'Log in to Clientry' })).toBeVisible();
    expect(requests).toEqual([{ method: 'POST', path: '/api/auth/logout' }]);
  });
});
