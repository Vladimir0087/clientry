import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { taskKeys } from '@/entities/task';
import { createQueryClient } from '@/shared/api/query-client';
import type { Task } from '@clientry/shared/tasks';

import { TaskView } from './task-view';
import { problemResponse } from '../../../../../../test/msw/problem';
import { recordRequests } from '../../../../../../test/msw/record';
import { renderWithProviders } from '../../../../../../test/render';
import { CLIENT_RELATED, makeTask, TEST_TASK } from '../../../../../../test/tasks';

function renderPage(task: Task): void {
  const queryClient = createQueryClient();
  queryClient.setQueryData(taskKeys.detail(task.id), task);
  renderWithProviders(<TaskView id={task.id} />, queryClient);
}

function detail(label: string): HTMLElement {
  const term = screen.getByText(label, { selector: 'dt' });
  const value = term.nextElementSibling;
  if (!(value instanceof HTMLElement)) {
    throw new Error(`No value for ${label}`);
  }
  return value;
}

describe('TaskView', () => {
  it('should show the details and link the deal with its client when the task loads', () => {
    renderPage(TEST_TASK);

    expect(screen.getByRole('heading', { level: 1, name: TEST_TASK.title })).toBeInTheDocument();
    expect(detail('Assignee')).toHaveTextContent(TEST_TASK.assignee.name);
    expect(detail('Due')).not.toBeEmptyDOMElement();
    expect(within(detail('Related to')).getByRole('link')).toHaveAttribute(
      'href',
      `/deals/${TEST_TASK.related?.id ?? ''}`,
    );
    expect(detail('Related to')).toHaveTextContent('Landing page for Romashka · Romashka LLC');
    expect(screen.getByText(/^Added by Ann Lee on/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Mark as done' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Edit' })).toHaveAttribute(
      'href',
      `/tasks/${TEST_TASK.id}/edit`,
    );
  });

  it('should link the client card when the task is linked to a client', () => {
    renderPage(makeTask(2, { related: CLIENT_RELATED }));

    expect(
      within(detail('Related to')).getByRole('link', { name: 'Romashka LLC' }),
    ).toHaveAttribute('href', `/clients/${CLIENT_RELATED.id}`);
  });

  it('should leave out Related to when the task is linked to nothing', () => {
    renderPage(makeTask(3, { related: null }));

    expect(screen.queryByText('Related to')).not.toBeInTheDocument();
  });

  it('should show Done, Completed and Reopen when the task is done', () => {
    renderPage(makeTask(4, { doneAt: '2026-10-12T10:00:00.000Z' }));

    expect(screen.getByText('Done')).toBeInTheDocument();
    expect(screen.getByText(/^Completed/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reopen' })).toBeInTheDocument();
  });

  it('should show Overdue when an open task is past due', () => {
    renderPage(makeTask(5, { dueAt: '2020-01-01T09:00:00.000Z' }));

    expect(screen.getByText('Overdue')).toBeInTheDocument();
  });

  it.each([
    [{ remindAt: null }, 'No reminder'],
    [{ reminderSentAt: '2099-10-15T11:00:01.000Z' }, /^Sent /],
  ])('should describe the reminder when the task has %j', (overrides, text) => {
    renderPage(makeTask(6, overrides));

    expect(detail('Reminder')).toHaveTextContent(text);
  });

  it('should show the not found state when the API answers 404', async () => {
    recordRequests('get', `/api/tasks/${TEST_TASK.id}`, () =>
      problemResponse(404, 'TASK_NOT_FOUND'),
    );

    renderWithProviders(<TaskView id={TEST_TASK.id} />);

    expect(await screen.findByRole('heading', { name: 'Task not found' })).toBeInTheDocument();
    expect(screen.getByText('It may have been deleted.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to tasks' })).toHaveAttribute('href', '/tasks');
  });
});
