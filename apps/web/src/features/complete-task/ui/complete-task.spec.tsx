import type { QueryClient } from '@tanstack/react-query';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse } from 'msw';
import type * as React from 'react';
import { describe, expect, it } from 'vitest';

import { TaskNotFound, TaskRowBody, taskKeys, useTask, useTasks } from '@/entities/task';
import type { TaskFilters } from '@/entities/task';
import { isNotFound } from '@/shared/api/api-status';
import { createQueryClient } from '@/shared/api/query-client';

import { CompleteTaskButton } from './complete-task-button';
import { CompleteTaskCheckbox } from './complete-task-checkbox';
import { held } from '../../../../test/held';
import { problemResponse } from '../../../../test/msw/problem';
import { recordRequests } from '../../../../test/msw/record';
import { renderWithProviders } from '../../../../test/render';
import { makeTaskPage, TEST_TASK } from '../../../../test/tasks';

const FILTERS: TaskFilters = { isMine: true, status: 'open' };
const DONE_FILTERS: TaskFilters = { isMine: true, status: 'done' };
const COMPLETE_PATH = `/api/tasks/${TEST_TASK.id}/complete`;
const REOPEN_PATH = `/api/tasks/${TEST_TASK.id}/reopen`;
const DONE_TASK = { ...TEST_TASK, doneAt: '2026-10-12T10:00:00.000Z' };

// The list as a page shows it: rows from the cache, with their checkboxes.
function TaskRows(): React.JSX.Element {
  const list = useTasks(FILTERS);
  const items = list.data?.pages.flatMap((page) => page.items) ?? [];
  return (
    <ul>
      {items.map((task, index) => (
        <li key={task.id}>
          <CompleteTaskCheckbox task={task} />
          <TaskRowBody task={task} index={index} isAssigneeShown={false} />
        </li>
      ))}
    </ul>
  );
}

// Another list on its first load, as the Done list right after the filter changes.
function DoneListState(): React.JSX.Element {
  const list = useTasks(DONE_FILTERS);
  return <p>{list.isSuccess ? 'Done list loaded' : 'Done list loading'}</p>;
}

// The task page as it chooses between the task and the not found state.
function TaskPage(): React.JSX.Element | null {
  const task = useTask(TEST_TASK.id);
  if (isNotFound(task.error)) {
    return <TaskNotFound />;
  }
  return task.data === undefined ? null : <CompleteTaskButton task={task.data} />;
}

function cacheRows(queryClient: QueryClient): void {
  queryClient.setQueryData(taskKeys.list(FILTERS), {
    pages: [makeTaskPage([TEST_TASK])],
    pageParams: [null],
  });
}

function renderRows(): ReturnType<typeof renderWithProviders> {
  const queryClient = createQueryClient();
  cacheRows(queryClient);
  return renderWithProviders(<TaskRows />, queryClient);
}

function renderTaskPage(): ReturnType<typeof renderWithProviders> {
  const queryClient = createQueryClient();
  queryClient.setQueryData(taskKeys.detail(TEST_TASK.id), TEST_TASK);
  return renderWithProviders(<TaskPage />, queryClient);
}

function checkbox(): HTMLElement {
  return screen.getByRole('checkbox');
}

function titleLink(): HTMLElement {
  return screen.getByRole('link', { name: TEST_TASK.title });
}

function isInvalidated(queryClient: QueryClient, queryKey: readonly unknown[]): boolean {
  return queryClient.getQueryState(queryKey)?.isInvalidated === true;
}

describe('CompleteTaskCheckbox', () => {
  it('should strike the row through before the response when the checkbox is ticked', async () => {
    const response = held();
    recordRequests('post', COMPLETE_PATH, async () => {
      await response.promise;
      return HttpResponse.json(DONE_TASK);
    });
    const user = userEvent.setup();
    renderRows();

    await user.click(screen.getByRole('checkbox', { name: `Mark ${TEST_TASK.title} as done` }));

    expect(checkbox()).toBeChecked();
    expect(titleLink()).toHaveClass('line-through');
  });

  it('should keep the row struck through without refetching the list when the server confirms', async () => {
    recordRequests('post', COMPLETE_PATH, () => HttpResponse.json(DONE_TASK));
    const lists = recordRequests('get', '/api/tasks', () =>
      HttpResponse.json(makeTaskPage([TEST_TASK])),
    );
    const user = userEvent.setup();
    const { queryClient } = renderRows();

    await user.click(checkbox());

    await waitFor(() => {
      expect(isInvalidated(queryClient, taskKeys.list(FILTERS))).toBe(true);
    });
    expect(checkbox()).toBeChecked();
    expect(titleLink()).toHaveClass('line-through');
    expect(checkbox()).toHaveAccessibleName(`Reopen ${TEST_TASK.title}`);
    expect(lists).toHaveLength(0);
  });

  it('should leave a list without the task stale when a row is toggled', async () => {
    const response = held();
    recordRequests('post', COMPLETE_PATH, async () => {
      await response.promise;
      return HttpResponse.json(DONE_TASK);
    });
    const queryClient = createQueryClient();
    cacheRows(queryClient);
    queryClient.setQueryData(taskKeys.list(DONE_FILTERS), {
      pages: [makeTaskPage([])],
      pageParams: [null],
    });
    await queryClient.invalidateQueries({
      queryKey: taskKeys.list(DONE_FILTERS),
      refetchType: 'none',
    });
    const user = userEvent.setup();
    renderWithProviders(<TaskRows />, queryClient);

    await user.click(checkbox());

    expect(checkbox()).toBeChecked();
    expect(isInvalidated(queryClient, taskKeys.list(DONE_FILTERS))).toBe(true);
  });

  it('should keep focus on the checkbox when it is toggled', async () => {
    recordRequests('post', COMPLETE_PATH, () => HttpResponse.json(DONE_TASK));
    const user = userEvent.setup();
    renderRows();

    await user.click(checkbox());

    await waitFor(() => {
      expect(checkbox()).toHaveAccessibleName(`Reopen ${TEST_TASK.title}`);
    });
    expect(checkbox()).toHaveFocus();
  });

  it('should untick the row and explain when the request fails', async () => {
    recordRequests('post', COMPLETE_PATH, () => problemResponse(500, 'INTERNAL_ERROR'));
    const user = userEvent.setup();
    renderRows();

    await user.click(checkbox());

    expect(await screen.findByText('Could not update the task. Try again.')).toBeInTheDocument();
    expect(checkbox()).not.toBeChecked();
  });

  it('should mark the lists and the detail stale without refetching when the request fails', async () => {
    recordRequests('post', COMPLETE_PATH, () => problemResponse(500, 'INTERNAL_ERROR'));
    const lists = recordRequests('get', '/api/tasks', () =>
      HttpResponse.json(makeTaskPage([TEST_TASK])),
    );
    const queryClient = createQueryClient();
    cacheRows(queryClient);
    queryClient.setQueryData(taskKeys.detail(TEST_TASK.id), TEST_TASK);
    const user = userEvent.setup();
    renderWithProviders(<TaskRows />, queryClient);

    await user.click(checkbox());

    expect(await screen.findByText('Could not update the task. Try again.')).toBeInTheDocument();
    expect(isInvalidated(queryClient, taskKeys.list(FILTERS))).toBe(true);
    expect(isInvalidated(queryClient, taskKeys.detail(TEST_TASK.id))).toBe(true);
    expect(lists).toHaveLength(0);
  });

  it('should say the task is gone and refetch the list when the API answers 404', async () => {
    recordRequests('post', COMPLETE_PATH, () => problemResponse(404, 'TASK_NOT_FOUND'));
    const lists = recordRequests('get', '/api/tasks', () => HttpResponse.json(makeTaskPage([])));
    const user = userEvent.setup();
    renderRows();

    await user.click(checkbox());

    expect(await screen.findByText('This task no longer exists.')).toBeInTheDocument();
    await waitFor(() => {
      expect(lists).toHaveLength(1);
    });
  });

  it('should send reopen only after complete is answered when the checkbox is toggled twice quickly', async () => {
    const first = held();
    const calls: string[] = [];
    recordRequests('post', COMPLETE_PATH, async () => {
      calls.push('complete sent');
      await first.promise;
      calls.push('complete answered');
      return HttpResponse.json(DONE_TASK);
    });
    recordRequests('post', REOPEN_PATH, () => {
      calls.push('reopen sent');
      return HttpResponse.json(TEST_TASK);
    });
    const user = userEvent.setup();
    renderRows();

    await user.click(checkbox());
    await user.click(checkbox());
    first.release();

    await waitFor(() => {
      expect(calls).toEqual(['complete sent', 'complete answered', 'reopen sent']);
    });
    await waitFor(() => {
      expect(checkbox()).not.toBeChecked();
    });
  });

  it('should show the state the server kept when both toggles of a quick double toggle fail', async () => {
    const first = held();
    recordRequests('post', COMPLETE_PATH, async () => {
      await first.promise;
      return problemResponse(500, 'INTERNAL_ERROR');
    });
    recordRequests('post', REOPEN_PATH, () => problemResponse(500, 'INTERNAL_ERROR'));
    const user = userEvent.setup();
    renderRows();

    await user.click(checkbox());
    await user.click(checkbox());
    first.release();

    expect(await screen.findByText('Could not update the task. Try again.')).toBeInTheDocument();
    await waitFor(() => {
      expect(checkbox()).not.toBeChecked();
    });
    expect(titleLink()).not.toHaveClass('line-through');
  });

  it('should show the state the server confirmed when the first toggle of a quick double toggle succeeds and the second fails', async () => {
    const first = held();
    recordRequests('post', COMPLETE_PATH, async () => {
      await first.promise;
      return HttpResponse.json(DONE_TASK);
    });
    recordRequests('post', REOPEN_PATH, () => problemResponse(500, 'INTERNAL_ERROR'));
    const user = userEvent.setup();
    renderRows();

    await user.click(checkbox());
    await user.click(checkbox());
    first.release();

    expect(await screen.findByText('Could not update the task. Try again.')).toBeInTheDocument();
    await waitFor(() => {
      expect(checkbox()).toBeChecked();
    });
    expect(titleLink()).toHaveClass('line-through');
  });

  it('should let another list finish its first load when a row is toggled meanwhile', async () => {
    const doneList = held();
    recordRequests('get', '/api/tasks', async () => {
      await doneList.promise;
      return HttpResponse.json(makeTaskPage([DONE_TASK]));
    });
    recordRequests('post', COMPLETE_PATH, () => HttpResponse.json(DONE_TASK));
    const queryClient = createQueryClient();
    cacheRows(queryClient);
    const user = userEvent.setup();
    renderWithProviders(
      <>
        <TaskRows />
        <DoneListState />
      </>,
      queryClient,
    );

    await user.click(checkbox());
    doneList.release();

    expect(await screen.findByText('Done list loaded')).toBeInTheDocument();
  });
});

describe('CompleteTaskButton', () => {
  it('should turn Mark as done into Reopen on the task page when it is pressed', async () => {
    recordRequests('post', COMPLETE_PATH, () => HttpResponse.json(DONE_TASK));
    const user = userEvent.setup();
    const { queryClient } = renderTaskPage();

    await user.click(screen.getByRole('button', { name: 'Mark as done' }));

    expect(screen.getByRole('button', { name: 'Reopen' })).toHaveFocus();
    await waitFor(() => {
      expect(queryClient.getQueryData(taskKeys.detail(TEST_TASK.id))).toEqual(DONE_TASK);
    });
  });

  it('should show the not found state on the task page when the API answers 404', async () => {
    recordRequests('post', COMPLETE_PATH, () => problemResponse(404, 'TASK_NOT_FOUND'));
    recordRequests('get', `/api/tasks/${TEST_TASK.id}`, () =>
      problemResponse(404, 'TASK_NOT_FOUND'),
    );
    const user = userEvent.setup();
    renderTaskPage();

    await user.click(screen.getByRole('button', { name: 'Mark as done' }));

    expect(await screen.findByRole('heading', { name: 'Task not found' })).toBeInTheDocument();
  });
});
