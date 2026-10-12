import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse } from 'msw';
import type * as React from 'react';
import { describe, expect, it } from 'vitest';

import { taskKeys, useTask } from '@/entities/task';
import { createQueryClient } from '@/shared/api/query-client';

import { DeleteTaskButton } from './delete-task-button';
import { TEST_SESSION } from '../../../../test/fixtures';
import { mockRouter } from '../../../../test/mocks/router';
import { problemResponse } from '../../../../test/msw/problem';
import { recordRequests } from '../../../../test/msw/record';
import type { Resolver } from '../../../../test/msw/record';
import { renderWithProviders } from '../../../../test/render';
import { OTHERS_TASK, TEST_TASK } from '../../../../test/tasks';

const TASK_PATH = `/api/tasks/${TEST_TASK.id}`;
const MANAGER_SESSION = { ...TEST_SESSION, role: 'manager' as const };

function TaskPage({ isShown }: { readonly isShown: boolean }): React.JSX.Element | null {
  return isShown ? <DeleteTaskButton task={TEST_TASK} /> : null;
}

// The task page keeps its task mounted while the route is being replaced.
function TaskPageWithTask(): React.JSX.Element {
  useTask(TEST_TASK.id);
  return <DeleteTaskButton task={TEST_TASK} />;
}

function answerDelete(resolver: Resolver): Request[] {
  return recordRequests('delete', TASK_PATH, resolver);
}

async function confirmDelete(): Promise<void> {
  await userEvent.click(await screen.findByRole('button', { name: 'Delete' }));
  const dialog = await screen.findByRole('alertdialog');
  await userEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));
}

describe('DeleteTaskButton', () => {
  it('should hide Delete when a manager looks at a task someone else created', async () => {
    recordRequests('get', '/api/auth/me', () => HttpResponse.json(MANAGER_SESSION));

    renderWithProviders(
      <>
        <section aria-label="Own task">
          <DeleteTaskButton task={TEST_TASK} />
        </section>
        <section aria-label="Other task">
          <DeleteTaskButton task={OTHERS_TASK} />
        </section>
      </>,
    );

    const own = within(screen.getByRole('region', { name: 'Own task' }));
    expect(await own.findByRole('button', { name: 'Delete' })).toBeInTheDocument();
    const other = within(screen.getByRole('region', { name: 'Other task' }));
    expect(other.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument();
  });

  it('should explain the delete, leave for the list and offer Undo when confirmed', async () => {
    const deletes = answerDelete(() => new HttpResponse(null, { status: 204 }));
    const reads = recordRequests('get', TASK_PATH, () => HttpResponse.json(TEST_TASK));
    const queryClient = createQueryClient();
    queryClient.setQueryData(taskKeys.detail(TEST_TASK.id), TEST_TASK);
    renderWithProviders(<TaskPageWithTask />, queryClient);

    await userEvent.click(await screen.findByRole('button', { name: 'Delete' }));
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveAccessibleName(`Delete ${TEST_TASK.title}?`);
    expect(dialog).toHaveAccessibleDescription(
      'The task disappears from lists. You can undo this right after.',
    );
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));

    expect(await screen.findByText('Task deleted')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Undo' })).toBeInTheDocument();
    expect(deletes).toHaveLength(1);
    expect(mockRouter.replace).toHaveBeenCalledWith('/tasks');
    expect(queryClient.getQueryState(taskKeys.detail(TEST_TASK.id))).toMatchObject({
      isInvalidated: true,
      fetchStatus: 'idle',
    });
    expect(reads).toHaveLength(0);
  });

  it('should restore when Undo is pressed after the task page has unmounted', async () => {
    answerDelete(() => new HttpResponse(null, { status: 204 }));
    const restores = recordRequests('post', `${TASK_PATH}/restore`, () =>
      HttpResponse.json(TEST_TASK),
    );
    const { rerender } = renderWithProviders(<TaskPage isShown />);
    await confirmDelete();
    const undo = await screen.findByRole('button', { name: 'Undo' });
    rerender(<TaskPage isShown={false} />);

    // A plain click: user-event's focus change hands sonner a relatedTarget jsdom cannot focus.
    fireEvent.click(undo);

    expect(await screen.findByText('Task restored')).toBeInTheDocument();
    expect(restores).toHaveLength(1);
  });

  it('should say so when the restore fails', async () => {
    answerDelete(() => new HttpResponse(null, { status: 204 }));
    recordRequests('post', `${TASK_PATH}/restore`, () => problemResponse(404, 'TASK_NOT_FOUND'));
    renderWithProviders(<TaskPage isShown />);
    await confirmDelete();

    fireEvent.click(await screen.findByRole('button', { name: 'Undo' }));

    expect(await screen.findByText('Could not restore the task.')).toBeInTheDocument();
  });

  it('should close the dialog and explain when the API answers 403', async () => {
    answerDelete(() => problemResponse(403, 'TASK_DELETE_FORBIDDEN'));
    renderWithProviders(<TaskPage isShown />);

    await confirmDelete();

    expect(await screen.findByText('You can delete only tasks you created.')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    });
    expect(mockRouter.replace).not.toHaveBeenCalled();
  });

  it('should leave for the list and say so when the task was already deleted', async () => {
    answerDelete(() => problemResponse(404, 'TASK_NOT_FOUND'));
    renderWithProviders(<TaskPage isShown />);

    await confirmDelete();

    expect(await screen.findByText('This task was already deleted.')).toBeInTheDocument();
    expect(mockRouter.replace).toHaveBeenCalledWith('/tasks');
  });

  it('should keep the dialog open with an alert when the API fails', async () => {
    answerDelete(() => problemResponse(500, 'INTERNAL_ERROR', { requestId: 'req-500' }));
    renderWithProviders(<TaskPage isShown />);

    await confirmDelete();

    const dialog = screen.getByRole('alertdialog');
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Reference: req-500');
  });
});
