import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse } from 'msw';
import type * as React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { notificationKeys } from '@/entities/notification';
import { createQueryClient } from '@/shared/api/query-client';
import { takeHeadingFocusRequest } from '@/shared/lib/heading-focus';
import { PageHeading } from '@/shared/ui/page-heading';

import { NotificationBell } from './notification-bell';
import { held } from '../../../../test/held';
import { mockPathname, mockRouter } from '../../../../test/mocks/router';
import { problemResponse } from '../../../../test/msw/problem';
import { recordRequests } from '../../../../test/msw/record';
import { makeNotification, makeNotificationPage } from '../../../../test/notifications';
import { renderWithProviders } from '../../../../test/render';

const MINUTE_MS = 60_000;
const NEWEST = makeNotification(3);
const OLDER = makeNotification(2, { readAt: '2026-10-15T07:00:00.000Z' });

// A minute at a time, so React renders between the timers as a browser would.
async function passMinutes(minutes: number): Promise<void> {
  for (let minute = 0; minute < minutes; minute += 1) {
    await act(() => vi.advanceTimersByTimeAsync(MINUTE_MS));
  }
}

function answerRead(): Request[] {
  return recordRequests(
    'post',
    `/api/notifications/${NEWEST.id}/read`,
    () => new HttpResponse(null, { status: 204 }),
  );
}

function findNewestEntry(): Promise<HTMLElement> {
  return screen.findByRole('link', {
    name: new RegExp(`^Unread Reminder: ${NEWEST.payload.task.title}`),
  });
}

function renderBell(count: number): ReturnType<typeof renderWithProviders> {
  const queryClient = createQueryClient();
  queryClient.setQueryData(notificationKeys.unreadCount, { count });
  return renderWithProviders(<NotificationBell />, queryClient);
}

function answerCount(count: () => number): Request[] {
  return recordRequests('get', '/api/notifications/unread-count', () =>
    HttpResponse.json({ count: count() }),
  );
}

function answerList(): Request[] {
  return recordRequests('get', '/api/notifications', () =>
    HttpResponse.json(makeNotificationPage([NEWEST, OLDER])),
  );
}

// A task page that mounts once an entry is followed, its heading taking the requested focus.
function BellOnPage({ isPageShown }: { readonly isPageShown: boolean }): React.JSX.Element {
  return (
    <>
      <NotificationBell />
      {isPageShown && (
        <main>
          <PageHeading>Task</PageHeading>
        </main>
      )}
    </>
  );
}

// jsdom cannot follow a link, and without Next's router a click would try to.
function preventLinkNavigation(event: MouseEvent): void {
  if (event.target instanceof Element && event.target.closest('a') !== null) {
    event.preventDefault();
  }
}

describe('NotificationBell', () => {
  beforeEach(() => {
    document.addEventListener('click', preventLinkNavigation);
  });

  afterEach(() => {
    vi.useRealTimers();
    document.removeEventListener('click', preventLinkNavigation);
  });

  it.each([
    [0, 'Notifications', null],
    [3, 'Notifications, 3 unread', '3'],
    [100, 'Notifications, 99+ unread', '99+'],
  ])('should name the bell and its badge when the unread count is %i', (count, name, badge) => {
    renderBell(count);

    const bell = screen.getByRole('button', { name });
    if (badge === null) {
      expect(bell).toHaveTextContent('');
    } else {
      expect(within(bell).getByText(badge)).toHaveAttribute('aria-hidden', 'true');
    }
  });

  it('should stop polling when the user is idle and ask at once on input', async () => {
    vi.useFakeTimers({
      toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'],
    });
    const polls = answerCount(() => 0);
    renderBell(0);

    await passMinutes(3);
    expect(polls).toHaveLength(3);
    await passMinutes(20);
    expect(polls).toHaveLength(15);

    fireEvent.keyDown(window, { key: 'a' });
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(polls).toHaveLength(16);
    await passMinutes(1);
    expect(polls).toHaveLength(17);
  });

  it('should ask once when the user comes back to a tab left idle', async () => {
    vi.useFakeTimers({
      toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'],
    });
    const polls = answerCount(() => 0);
    renderBell(0);
    await passMinutes(20);
    expect(polls).toHaveLength(15);

    await act(async () => {
      window.dispatchEvent(new Event('visibilitychange'));
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(polls).toHaveLength(16);
    fireEvent.keyDown(window, { key: 'a' });
    await act(() => vi.advanceTimersByTimeAsync(0));

    expect(polls).toHaveLength(16);
  });

  it('should show no toast when the first count arrives without one prefetched', async () => {
    answerCount(() => 2);
    answerList();
    const queryClient = createQueryClient();
    renderWithProviders(<NotificationBell />, queryClient);

    expect(
      await screen.findByRole('button', { name: 'Notifications, 2 unread' }),
    ).toBeInTheDocument();
    await waitFor(() => {
      expect(queryClient.isFetching()).toBe(0);
    });
    expect(screen.queryByText(/^Reminder:|new reminder/)).not.toBeInTheDocument();
  });

  it('should show no toast when the first count after a load arrives', async () => {
    answerCount(() => 2);
    const { queryClient } = renderBell(2);

    await act(() => queryClient.refetchQueries({ queryKey: notificationKeys.unreadCount }));

    expect(screen.queryByText(/Reminder:|new reminders/)).not.toBeInTheDocument();
  });

  it('should toast the new reminder and open its task when the count rises by one', async () => {
    let count = 1;
    answerCount(() => count);
    answerList();
    const reads = recordRequests(
      'post',
      `/api/notifications/${NEWEST.id}/read`,
      () => new HttpResponse(null, { status: 204 }),
    );
    const { queryClient } = renderBell(1);

    count = 2;
    await act(() => queryClient.refetchQueries({ queryKey: notificationKeys.unreadCount }));

    expect(await screen.findByText(`Reminder: ${NEWEST.payload.task.title}`)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    await waitFor(() => {
      expect(reads).toHaveLength(1);
    });
    expect(mockRouter.push).toHaveBeenCalledWith(`/tasks/${NEWEST.payload.task.id}`);
  });

  it('should keep the reminder toast past the default four seconds when it shows', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    let count = 1;
    answerCount(() => count);
    answerList();
    const { queryClient } = renderBell(1);

    count = 2;
    await act(() => queryClient.refetchQueries({ queryKey: notificationKeys.unreadCount }));
    const title = `Reminder: ${NEWEST.payload.task.title}`;
    await vi.waitFor(() => {
      expect(screen.getByText(title)).toBeInTheDocument();
    });

    await act(() => vi.advanceTimersByTimeAsync(6_000));
    expect(screen.getByText(title)).toBeInTheDocument();
    await act(() => vi.advanceTimersByTimeAsync(5_000));
    expect(screen.queryByText(title)).not.toBeInTheDocument();
  });

  it('should keep one toast when the count rises twice', async () => {
    let count = 1;
    answerCount(() => count);
    answerList();
    const { queryClient } = renderBell(1);

    count = 2;
    await act(() => queryClient.refetchQueries({ queryKey: notificationKeys.unreadCount }));
    expect(await screen.findByText(`Reminder: ${NEWEST.payload.task.title}`)).toBeInTheDocument();
    count = 4;
    await act(() => queryClient.refetchQueries({ queryKey: notificationKeys.unreadCount }));

    expect(await screen.findByText('2 new reminders')).toBeInTheDocument();
    expect(screen.queryByText(`Reminder: ${NEWEST.payload.task.title}`)).not.toBeInTheDocument();
  });

  it('should announce nothing when the server count comes back after an entry is read', async () => {
    answerList();
    answerRead();
    const counts = answerCount(() => 100);
    const user = userEvent.setup();
    const { queryClient } = renderBell(100);

    await user.click(screen.getByRole('button', { name: 'Notifications, 99+ unread' }));
    await user.click(await findNewestEntry());

    await waitFor(() => {
      expect(counts).toHaveLength(1);
    });
    await waitFor(() => {
      expect(queryClient.isFetching()).toBe(0);
    });
    expect(screen.queryByText(/^Reminder:|new reminder/)).not.toBeInTheDocument();
  });

  it('should toast the number and open the popover from Show when the count rises by more', async () => {
    let count = 0;
    answerCount(() => count);
    answerList();
    const { queryClient } = renderBell(0);

    count = 2;
    await act(() => queryClient.refetchQueries({ queryKey: notificationKeys.unreadCount }));

    expect(await screen.findByText('2 new reminders')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Show' }));
    expect(await screen.findByRole('dialog', { name: 'Notifications' })).toBeInTheDocument();
  });

  it('should mark the entry read, close the popover and ask for the heading focus when an entry is followed', async () => {
    answerList();
    const reads = answerRead();
    const user = userEvent.setup();
    renderBell(1);

    await user.click(screen.getByRole('button', { name: 'Notifications, 1 unread' }));
    const entry = await findNewestEntry();
    expect(entry).toHaveAttribute('href', `/tasks/${NEWEST.payload.task.id}`);
    await user.click(entry);

    await waitFor(() => {
      expect(reads).toHaveLength(1);
    });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(takeHeadingFocusRequest()).toBe(true);
  });

  it('should mark the entry read and keep the popover open when an entry opens in a new tab', async () => {
    answerList();
    const reads = answerRead();
    const user = userEvent.setup();
    renderBell(1);

    await user.click(screen.getByRole('button', { name: 'Notifications, 1 unread' }));
    await user.keyboard('{Control>}');
    await user.click(await findNewestEntry());
    await user.keyboard('{/Control}');

    await waitFor(() => {
      expect(reads).toHaveLength(1);
    });
    expect(screen.getByRole('dialog', { name: 'Notifications' })).toBeInTheDocument();
    expect(takeHeadingFocusRequest()).toBe(false);
  });

  it('should mark the entry read and keep the popover open when an entry is middle-clicked', async () => {
    answerList();
    const reads = answerRead();
    const user = userEvent.setup();
    renderBell(1);

    await user.click(screen.getByRole('button', { name: 'Notifications, 1 unread' }));
    fireEvent(
      await findNewestEntry(),
      new MouseEvent('auxclick', { bubbles: true, cancelable: true, button: 1 }),
    );

    await waitFor(() => {
      expect(reads).toHaveLength(1);
    });
    expect(screen.getByRole('dialog', { name: 'Notifications' })).toBeInTheDocument();
    expect(takeHeadingFocusRequest()).toBe(false);
  });

  it('should leave the focus with the new page heading when an entry opens another task', async () => {
    answerList();
    answerRead();
    const queryClient = createQueryClient();
    queryClient.setQueryData(notificationKeys.unreadCount, { count: 1 });
    const user = userEvent.setup();
    const { rerender } = renderWithProviders(<BellOnPage isPageShown={false} />, queryClient);
    await user.click(screen.getByRole('button', { name: 'Notifications, 1 unread' }));
    const entry = await findNewestEntry();

    // The page mounts before Radix's close auto-focus, as after the exit animation in a browser.
    fireEvent.click(entry);
    rerender(<BellOnPage isPageShown />);

    await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
    expect(screen.getByRole('heading', { name: 'Task' })).toHaveFocus();
  });

  it('should return focus to the bell when the popover is closed with Escape', async () => {
    answerList();
    const user = userEvent.setup();
    renderBell(1);
    const bell = screen.getByRole('button', { name: 'Notifications, 1 unread' });
    await user.click(bell);
    await findNewestEntry();

    await user.keyboard('{Escape}');

    await waitFor(() => {
      expect(bell).toHaveFocus();
    });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('should send the newest entry as before and keep focus on the first entry when all are marked read', async () => {
    answerList();
    const marks = recordRequests(
      'post',
      '/api/notifications/read-all',
      () => new HttpResponse(null, { status: 204 }),
    );
    answerCount(() => 0);
    const user = userEvent.setup();
    renderBell(1);

    await user.click(screen.getByRole('button', { name: 'Notifications, 1 unread' }));
    await user.click(await screen.findByRole('button', { name: 'Mark all as read' }));

    await waitFor(() => {
      expect(marks).toHaveLength(1);
    });
    expect(await marks[0]?.json()).toEqual({ before: NEWEST.createdAt });
    expect(screen.queryByRole('button', { name: 'Mark all as read' })).not.toBeInTheDocument();
    expect(screen.getAllByRole('link')[0]).toHaveFocus();
    expect(screen.getByRole('button', { name: 'Notifications' })).toBeInTheDocument();
  });

  it('should keep the entries read when a list fetch begun before Mark all as read answers late', async () => {
    const lateList = held();
    let isMarked = false;
    let lists = 0;
    recordRequests('get', '/api/notifications', async () => {
      lists += 1;
      const newest = isMarked ? { ...NEWEST, readAt: '2026-10-15T08:00:00.000Z' } : NEWEST;
      const page = makeNotificationPage([newest, OLDER]);
      if (lists === 1) {
        await lateList.promise;
      }
      return HttpResponse.json(page);
    });
    recordRequests('post', '/api/notifications/read-all', () => {
      isMarked = true;
      return new HttpResponse(null, { status: 204 });
    });
    answerCount(() => 0);
    const queryClient = createQueryClient();
    queryClient.setQueryData(notificationKeys.unreadCount, { count: 1 });
    queryClient.setQueryData(
      notificationKeys.list,
      { pages: [makeNotificationPage([NEWEST, OLDER])], pageParams: [null] },
      { updatedAt: Date.now() - 2 * MINUTE_MS },
    );
    const user = userEvent.setup();
    renderWithProviders(<NotificationBell />, queryClient);

    await user.click(screen.getByRole('button', { name: 'Notifications, 1 unread' }));
    await user.click(await screen.findByRole('button', { name: 'Mark all as read' }));
    lateList.release();

    await waitFor(() => {
      expect(lists).toBe(2);
    });
    await waitFor(() => {
      expect(queryClient.isFetching()).toBe(0);
    });
    expect(screen.queryByRole('button', { name: 'Mark all as read' })).not.toBeInTheDocument();
  });

  it('should focus the heading of the task in view when its entry is followed', async () => {
    mockPathname.current = `/tasks/${NEWEST.payload.task.id}`;
    answerList();
    answerRead();
    const queryClient = createQueryClient();
    queryClient.setQueryData(notificationKeys.unreadCount, { count: 1 });
    const user = userEvent.setup();
    renderWithProviders(
      <>
        <NotificationBell />
        <main>
          <h1 tabIndex={-1}>Task</h1>
        </main>
      </>,
      queryClient,
    );

    await user.click(screen.getByRole('button', { name: 'Notifications, 1 unread' }));
    await user.click(await findNewestEntry());

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Task' })).toHaveFocus();
    });
    expect(takeHeadingFocusRequest()).toBe(false);
  });

  it('should say there is nothing yet when the list is empty', async () => {
    recordRequests('get', '/api/notifications', () => HttpResponse.json(makeNotificationPage([])));
    const user = userEvent.setup();
    renderBell(0);

    await user.click(screen.getByRole('button', { name: 'Notifications' }));

    expect(
      await screen.findByText('No notifications yet. Reminders for your tasks appear here.'),
    ).toBeInTheDocument();
  });

  it('should focus the Notifications heading when Try again reloads the list', async () => {
    let calls = 0;
    recordRequests('get', '/api/notifications', () => {
      calls += 1;
      return calls === 1
        ? problemResponse(400, 'VALIDATION_FAILED')
        : HttpResponse.json(makeNotificationPage([NEWEST]));
    });
    const user = userEvent.setup();
    renderBell(0);

    await user.click(screen.getByRole('button', { name: 'Notifications' }));
    await user.click(await screen.findByRole('button', { name: 'Try again' }));

    expect(screen.getByRole('heading', { name: 'Notifications' })).toHaveFocus();
    expect(await screen.findByRole('link', { name: /Reminder:/ })).toBeInTheDocument();
  });
});
