import { createClient, createTask } from '../support/api.js';
import { expect, test } from '../support/fixtures.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const REMINDER_DELAY_MS = 5000;

// The form's date input takes the browser's local date, and the browser runs on this machine.
function localDate(time: Date): string {
  const month = String(time.getMonth() + 1).padStart(2, '0');
  const day = String(time.getDate()).padStart(2, '0');
  return `${String(time.getFullYear())}-${month}-${day}`;
}

test.describe('tasks', () => {
  test('should list a task under its assignee when it is created for a client with a due time and a reminder', async ({
    page,
    owner,
  }) => {
    await createClient(page.request, { name: 'Romashka LLC' });
    await page.goto('/tasks');
    await page.getByRole('link', { name: 'New task' }).click();
    await page.getByLabel('Title').fill('Call back about the quote');
    await page.getByLabel('Due date').fill(localDate(new Date(Date.now() + DAY_MS)));
    await page.getByLabel('Due time').fill('15:00');
    await page.getByRole('combobox', { name: 'Reminder' }).click();
    await page.getByRole('option', { name: '1 hour before' }).click();
    await page.getByRole('combobox', { name: 'Client' }).click();
    await page.getByRole('option', { name: /^Romashka LLC/ }).click();

    await page.getByRole('button', { name: 'Create task' }).click();

    await expect(
      page.getByRole('heading', { level: 1, name: 'Call back about the quote' }),
    ).toBeVisible();
    await page.goto('/tasks?assignee=anyone');
    const row = page
      .getByRole('listitem')
      .filter({ has: page.getByRole('link', { name: 'Call back about the quote' }) });
    await expect(row).toContainText(owner.user.name);
    await expect(row.getByRole('link', { name: 'Client Romashka LLC' })).toBeVisible();
    await expect(row).toContainText(/Reminder at .+, 2:00\sPM/);
  });

  test('should show the reminder in the bell when its time comes', async ({ page, owner }) => {
    const now = Date.now();
    const task = await createTask(page.request, {
      title: 'Send the contract',
      dueAt: new Date(now + DAY_MS).toISOString(),
      remindAt: new Date(now + REMINDER_DELAY_MS).toISOString(),
      assigneeId: owner.user.id,
    });
    await page.goto('/');
    const bell = page.getByRole('button', { name: 'Notifications, 1 unread' });

    // The bell polls once a minute; a reload asks at once.
    await expect(async () => {
      await page.reload();
      await expect(bell).toBeVisible({ timeout: 2000 });
    }).toPass({ timeout: 20_000 });
    await bell.click();
    await page.getByRole('link', { name: /Reminder: Send the contract/ }).click();

    await expect(page).toHaveURL(new RegExp(`/tasks/${task.id}$`));
    await expect(page.getByRole('heading', { level: 1, name: 'Send the contract' })).toBeVisible();
  });

  test('should move a task to the done ones when it is marked as done', async ({ page, owner }) => {
    await createTask(page.request, {
      title: 'Prepare the proposal',
      dueAt: new Date(Date.now() + DAY_MS).toISOString(),
      assigneeId: owner.user.id,
    });
    await page.goto('/tasks');

    await page.getByRole('checkbox', { name: 'Mark Prepare the proposal as done' }).click();

    await expect(page.getByRole('checkbox', { name: 'Reopen Prepare the proposal' })).toBeChecked();
    await page.getByRole('group', { name: 'Status' }).getByRole('button', { name: 'Done' }).click();
    await expect(page.getByRole('link', { name: 'Prepare the proposal' })).toBeVisible();
    // A toggled row stays in place until its list is fetched again.
    await page.goto('/tasks');
    await expect(page.getByText('No open tasks are assigned to you.')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Prepare the proposal' })).toBeHidden();
  });
});
