import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { delay, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';

import { memberKeys } from '@/entities/member';
import { createQueryClient } from '@/shared/api/query-client';

import { TasksView } from './tasks-view';
import { OTHER_USER } from '../../../../../test/clients';
import { TEST_MEMBERS } from '../../../../../test/deals';
import { failOnceThenWait } from '../../../../../test/msw/fail-once';
import { recordRequests } from '../../../../../test/msw/record';
import type { Resolver } from '../../../../../test/msw/record';
import { renderWithUrl } from '../../../../../test/render';
import { CLIENT_RELATED, makeTask, makeTaskPage, TEST_TASK } from '../../../../../test/tasks';

const OTHER_MEMBER = {
  ...OTHER_USER,
  email: 'max@example.com',
  role: 'manager',
  joinedAt: '2026-10-02T09:00:00.000Z',
} as const;

function answerList(resolver: Resolver): Request[] {
  return recordRequests('get', '/api/tasks', resolver);
}

function searchOf(request: Request | undefined): string {
  return new URL(request?.url ?? 'http://web.test').search;
}

function rows(): HTMLElement[] {
  return within(screen.getByRole('list')).getAllByRole('listitem');
}

describe('TasksView', () => {
  it('should show skeleton rows when the list is loading', () => {
    answerList(async () => delay('infinite').then(() => HttpResponse.json(makeTaskPage([]))));

    renderWithUrl(<TasksView />);

    expect(screen.getByTestId('task-list-skeleton')).toBeInTheDocument();
  });

  it('should read Assignee: Me and Open and ask for my open tasks when the URL has no filters', async () => {
    const requests = answerList(() => HttpResponse.json(makeTaskPage([TEST_TASK])));

    renderWithUrl(<TasksView />);

    expect(screen.getByRole('button', { name: 'Assignee: Me' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open' })).toHaveAttribute('aria-pressed', 'true');
    expect(await screen.findByRole('link', { name: TEST_TASK.title })).toHaveAttribute(
      'href',
      `/tasks/${TEST_TASK.id}`,
    );
    expect(searchOf(requests[0])).toBe('?assignee=me');
  });

  it('should read Anyone, send no assignee and show assignees when the URL has assignee=anyone', async () => {
    const task = makeTask(2, { assignee: OTHER_USER, related: CLIENT_RELATED });
    const requests = answerList(() => HttpResponse.json(makeTaskPage([task])));

    renderWithUrl(<TasksView />, '?assignee=anyone');

    expect(screen.getByRole('button', { name: 'Assignee: Anyone' })).toBeInTheDocument();
    await screen.findByRole('link', { name: task.title });
    expect(screen.getByText(OTHER_USER.name)).toHaveTextContent(`Assigned to ${OTHER_USER.name}`);
    expect(screen.getByRole('link', { name: `Client ${CLIENT_RELATED.name}` })).toHaveAttribute(
      'href',
      `/clients/${CLIENT_RELATED.id}`,
    );
    expect(searchOf(requests[0])).toBe('');
  });

  it('should link the deal and its client when a row is linked to a deal', async () => {
    answerList(() => HttpResponse.json(makeTaskPage([TEST_TASK])));

    renderWithUrl(<TasksView />);

    const related = TEST_TASK.related;
    if (related?.kind !== 'deal') {
      throw new Error('TEST_TASK is linked to a deal');
    }
    expect(await screen.findByRole('link', { name: `Deal ${related.title}` })).toHaveAttribute(
      'href',
      `/deals/${related.id}`,
    );
    expect(screen.getByRole('link', { name: `Client ${related.client.name}` })).toHaveAttribute(
      'href',
      `/clients/${related.client.id}`,
    );
  });

  it('should show done rows with their checkbox ticked when the URL has status=done', async () => {
    const done = makeTask(3, { doneAt: '2026-10-12T10:00:00.000Z' });
    const requests = answerList(() => HttpResponse.json(makeTaskPage([done])));

    renderWithUrl(<TasksView />, '?status=done');

    expect(screen.getByRole('button', { name: 'Done' })).toHaveAttribute('aria-pressed', 'true');
    expect(await screen.findByRole('checkbox', { name: `Reopen ${done.title}` })).toBeChecked();
    expect(within(rows()[0] ?? document.body).getByText(/^Done/)).toHaveTextContent(/^Done \w+/);
    expect(searchOf(requests[0])).toBe('?status=done&assignee=me');
  });

  it('should leave the defaults out of the URL when the filters return to them', async () => {
    answerList(() => HttpResponse.json(makeTaskPage([TEST_TASK])));
    const user = userEvent.setup();
    const { urlUpdates } = renderWithUrl(<TasksView />, '?assignee=anyone&status=done');

    await user.click(screen.getByRole('button', { name: 'Assignee: Anyone' }));
    await user.click(await screen.findByRole('menuitemradio', { name: 'Me' }));
    await user.click(screen.getByRole('button', { name: 'Open' }));

    await waitFor(() => {
      expect(urlUpdates.at(-1)?.queryString).toBe('');
    });
    expect(urlUpdates.every((update) => update.options.history === 'replace')).toBe(true);
  });

  it('should say nothing is assigned and focus the menu on Anyone when everyone is shown from the empty state', async () => {
    answerList(() => HttpResponse.json(makeTaskPage([])));
    const user = userEvent.setup();
    const { urlUpdates } = renderWithUrl(<TasksView />);

    expect(await screen.findByText('No open tasks are assigned to you.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: "Show everyone's tasks" }));

    expect(screen.getByRole('button', { name: 'Assignee: Anyone' })).toHaveFocus();
    expect(urlUpdates.at(-1)?.queryString).toBe('?assignee=anyone');
  });

  it('should send the member id and hide the assignee on rows when the URL has a member', async () => {
    const task = makeTask(4, { assignee: OTHER_USER });
    const requests = answerList(() => HttpResponse.json(makeTaskPage([task])));

    renderWithUrl(<TasksView />, `?assignee=${OTHER_USER.id}`);

    await screen.findByRole('link', { name: task.title });
    expect(within(screen.getByRole('list')).queryByText(OTHER_USER.name)).not.toBeInTheDocument();
    expect(searchOf(requests[0])).toBe(`?assignee=${OTHER_USER.id}`);
  });

  it('should ask for the members on mount and name the member on the menu when the URL has a member and none are cached', async () => {
    answerList(() => HttpResponse.json(makeTaskPage([makeTask(4, { assignee: OTHER_USER })])));
    const memberRequests = recordRequests('get', '/api/members', () =>
      HttpResponse.json({ items: [...TEST_MEMBERS.items, { ...OTHER_MEMBER }] }),
    );

    renderWithUrl(<TasksView />, `?assignee=${OTHER_USER.id}`);

    expect(
      await screen.findByRole('button', { name: `Assignee: ${OTHER_USER.name}` }),
    ).toBeInTheDocument();
    expect(memberRequests).toHaveLength(1);
  });

  it.each([
    [OTHER_USER.id, `No open tasks are assigned to ${OTHER_USER.name}.`],
    ['0199a3c4-0000-7000-8000-000000000000', 'No open tasks are assigned to this member.'],
  ])('should name whose tasks are missing when the URL has assignee=%s', async (id, text) => {
    answerList(() => HttpResponse.json(makeTaskPage([])));
    const queryClient = createQueryClient();
    queryClient.setQueryData(memberKeys.list, {
      items: [...TEST_MEMBERS.items, { ...OTHER_MEMBER }],
    });

    renderWithUrl(<TasksView />, `?assignee=${id}`, queryClient);

    expect(await screen.findByText(text)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: "Show everyone's tasks" })).toBeInTheDocument();
  });

  it.each([
    ['?assignee=anyone', 'No open tasks. Add one with New task.'],
    ['?status=done', 'No completed tasks yet.'],
  ])('should show its empty state when the URL is %s', async (search, text) => {
    answerList(() => HttpResponse.json(makeTaskPage([])));

    renderWithUrl(<TasksView />, search);

    expect(await screen.findByText(text)).toBeInTheDocument();
  });

  it('should keep focus on Load more when a page arrives and another follows', async () => {
    const first = Array.from({ length: 25 }, (_, index) => makeTask(index + 1));
    const second = Array.from({ length: 25 }, (_, index) => makeTask(index + 26));
    const requests = answerList(({ request }) =>
      new URL(request.url).searchParams.get('cursor') === 'page-2'
        ? HttpResponse.json(makeTaskPage(second, 'page-3'))
        : HttpResponse.json(makeTaskPage(first, 'page-2')),
    );
    const user = userEvent.setup();
    renderWithUrl(<TasksView />);

    await user.click(await screen.findByRole('button', { name: 'Load more' }));

    await waitFor(() => {
      expect(rows()).toHaveLength(50);
    });
    expect(searchOf(requests[1])).toBe('?assignee=me&cursor=page-2');
    expect(screen.getByRole('button', { name: 'Load more' })).toHaveFocus();
  });

  it('should append the last page and move focus to its first row when Load more is pressed', async () => {
    const first = Array.from({ length: 25 }, (_, index) => makeTask(index + 1));
    const second = [makeTask(26), makeTask(27)];
    answerList(({ request }) =>
      new URL(request.url).searchParams.get('cursor') === 'page-2'
        ? HttpResponse.json(makeTaskPage(second))
        : HttpResponse.json(makeTaskPage(first, 'page-2')),
    );
    const user = userEvent.setup();
    renderWithUrl(<TasksView />);

    await user.click(await screen.findByRole('button', { name: 'Load more' }));

    await waitFor(() => {
      expect(rows()).toHaveLength(27);
    });
    expect(screen.queryByRole('button', { name: 'Load more' })).not.toBeInTheDocument();
    expect(screen.getByText('Task 26')).toHaveFocus();
  });

  it('should move focus to the last row when Load more brings an empty last page', async () => {
    const first = Array.from({ length: 25 }, (_, index) => makeTask(index + 1));
    answerList(({ request }) =>
      new URL(request.url).searchParams.get('cursor') === 'page-2'
        ? HttpResponse.json(makeTaskPage([]))
        : HttpResponse.json(makeTaskPage(first, 'page-2')),
    );
    const user = userEvent.setup();
    renderWithUrl(<TasksView />);

    await user.click(await screen.findByRole('button', { name: 'Load more' }));

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Load more' })).not.toBeInTheDocument();
    });
    expect(rows()).toHaveLength(25);
    expect(screen.getByText('Task 25')).toHaveFocus();
  });

  it('should focus the Tasks heading when Try again reloads the list', async () => {
    answerList(failOnceThenWait(makeTaskPage([])));
    const user = userEvent.setup();
    renderWithUrl(<TasksView />);

    await user.click(await screen.findByRole('button', { name: 'Try again' }));

    expect(await screen.findByTestId('task-list-skeleton')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Tasks' })).toHaveFocus();
  });

  it('should keep the old rows dimmed and busy when the filters change', async () => {
    answerList(async ({ request }) => {
      if (new URL(request.url).searchParams.get('status') === 'done') {
        await delay('infinite');
      }
      return HttpResponse.json(makeTaskPage([TEST_TASK]));
    });
    const user = userEvent.setup();
    renderWithUrl(<TasksView />);
    await screen.findByRole('link', { name: TEST_TASK.title });

    await user.click(screen.getByRole('button', { name: 'Done' }));

    await waitFor(() => {
      expect(screen.getByRole('list').parentElement).toHaveAttribute('aria-busy', 'true');
    });
    expect(screen.getByRole('link', { name: TEST_TASK.title })).toBeInTheDocument();
  });
});
