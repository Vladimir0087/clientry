import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse } from 'msw';
import type * as React from 'react';
import { describe, expect, it } from 'vitest';

import { clientKeys, DEFAULT_CLIENT_FILTERS, useClientList } from '@/entities/client';
import { dealKeys, stageKeys, useClientDeals } from '@/entities/deal';
import { taskKeys, useTasks } from '@/entities/task';
import type { TaskFilters } from '@/entities/task';
import { createQueryClient } from '@/shared/api/query-client';
import type { Client } from '@clientry/shared/clients';

import { DeleteClientButton } from './delete-client-button';
import { clientPage, OTHER_USER, TEST_CLIENT } from '../../../../test/clients';
import { makeBoard, TEST_STAGES } from '../../../../test/deals';
import { TEST_SESSION } from '../../../../test/fixtures';
import { mockRouter } from '../../../../test/mocks/router';
import { problemResponse } from '../../../../test/msw/problem';
import { recordRequests } from '../../../../test/msw/record';
import type { Resolver } from '../../../../test/msw/record';
import { renderWithProviders } from '../../../../test/render';

const CLIENT_PATH = `/api/clients/${TEST_CLIENT.id}`;
const MANAGER_SESSION = { ...TEST_SESSION, role: 'manager' as const };
const OTHERS_CLIENT: Client = { ...TEST_CLIENT, createdBy: OTHER_USER };
const OPEN_TASKS: TaskFilters = { assignee: 'me', status: 'open' };
const CLIENT_TASKS: TaskFilters = { assignee: null, status: 'open', clientId: TEST_CLIENT.id };
const NO_TASKS = { pages: [{ items: [], nextCursor: null }], pageParams: [null] };

function ClientList(): React.JSX.Element | null {
  useClientList(DEFAULT_CLIENT_FILTERS);
  return null;
}

interface CardProps {
  readonly client: Client;
  readonly isCardShown: boolean;
}

// The list stays mounted, as the list page does after the card is left.
function Screen({ client, isCardShown }: CardProps): React.JSX.Element {
  return (
    <>
      <ClientList />
      {isCardShown && <DeleteClientButton client={client} />}
    </>
  );
}

// The card keeps its deals and tasks mounted while the route is being replaced.
function CardWithSections({ client }: { readonly client: Client }): React.JSX.Element {
  useClientDeals(client.id);
  useTasks(CLIENT_TASKS);
  return <DeleteClientButton client={client} />;
}

function answerDelete(resolver: Resolver): Request[] {
  return recordRequests('delete', CLIENT_PATH, resolver);
}

function answerSession(session: object): void {
  recordRequests('get', '/api/auth/me', () => HttpResponse.json(session));
}

async function confirmDelete(): Promise<void> {
  await userEvent.click(await screen.findByRole('button', { name: 'Delete' }));
  const dialog = await screen.findByRole('alertdialog');
  await userEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));
}

describe('DeleteClientButton', () => {
  it('should hide Delete when a manager looks at a client someone else created', async () => {
    recordRequests('get', '/api/auth/me', () => HttpResponse.json(MANAGER_SESSION));

    renderWithProviders(
      <>
        <section aria-label="Own client">
          <DeleteClientButton client={TEST_CLIENT} />
        </section>
        <section aria-label="Other client">
          <DeleteClientButton client={OTHERS_CLIENT} />
        </section>
      </>,
    );

    // The own client's Delete shows once the session has loaded.
    const own = within(screen.getByRole('region', { name: 'Own client' }));
    expect(await own.findByRole('button', { name: 'Delete' })).toBeInTheDocument();
    const other = within(screen.getByRole('region', { name: 'Other client' }));
    expect(other.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument();
  });

  it.each([
    ['a manager looks at their own client', MANAGER_SESSION, TEST_CLIENT],
    ['the owner looks at a manager client', TEST_SESSION, OTHERS_CLIENT],
  ])('should show Delete when %s', async (_case, session, client) => {
    answerSession(session);

    renderWithProviders(<DeleteClientButton client={client} />);

    expect(await screen.findByRole('button', { name: 'Delete' })).toBeInTheDocument();
  });

  it('should delete, leave for the list without refetching the client and offer Undo when confirmed', async () => {
    const deletes = answerDelete(() => new HttpResponse(null, { status: 204 }));
    const reads = recordRequests('get', CLIENT_PATH, () => HttpResponse.json(TEST_CLIENT));
    recordRequests('get', '/api/clients', () => HttpResponse.json(clientPage([])));
    const queryClient = createQueryClient();
    queryClient.setQueryData(clientKeys.detail(TEST_CLIENT.id), TEST_CLIENT);
    renderWithProviders(<Screen client={TEST_CLIENT} isCardShown />, queryClient);

    await confirmDelete();

    expect(await screen.findByText('Client deleted')).toBeInTheDocument();
    expect(deletes).toHaveLength(1);
    expect(mockRouter.replace).toHaveBeenCalledWith('/clients');
    expect(screen.getByRole('button', { name: 'Undo' })).toBeInTheDocument();
    expect(reads).toHaveLength(0);
    expect(queryClient.getQueryState(clientKeys.detail(TEST_CLIENT.id))?.isInvalidated).toBe(true);
  });

  it('should say the deals and tasks go with the client and mark them stale without refetching the card deals when confirmed', async () => {
    answerDelete(() => new HttpResponse(null, { status: 204 }));
    const taskReads = recordRequests('get', '/api/tasks', () =>
      HttpResponse.json({ items: [], nextCursor: null }),
    );
    const queryClient = createQueryClient();
    queryClient.setQueryData(dealKeys.board({ assignee: null }), makeBoard([]));
    queryClient.setQueryData(dealKeys.byClient(TEST_CLIENT.id), { items: [], hasMore: false });
    queryClient.setQueryData(stageKeys.list, TEST_STAGES);
    queryClient.setQueryData(taskKeys.list(CLIENT_TASKS), NO_TASKS);
    renderWithProviders(<CardWithSections client={TEST_CLIENT} />, queryClient);

    await userEvent.click(await screen.findByRole('button', { name: 'Delete' }));
    expect(await screen.findByRole('alertdialog')).toHaveAccessibleDescription(
      'The client, their deals and tasks disappear from lists, search and the board. You can undo this right after.',
    );
    await userEvent.click(
      within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Delete' }),
    );

    await waitFor(() => {
      expect(queryClient.getQueryState(dealKeys.board({ assignee: null }))?.isInvalidated).toBe(
        true,
      );
    });
    expect(queryClient.getQueryState(stageKeys.list)?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(dealKeys.byClient(TEST_CLIENT.id))).toMatchObject({
      isInvalidated: true,
      fetchStatus: 'idle',
    });
    expect(queryClient.getQueryState(taskKeys.list(CLIENT_TASKS))).toMatchObject({
      isInvalidated: true,
      fetchStatus: 'idle',
    });
    expect(taskReads).toHaveLength(0);
  });

  it('should mark the tasks stale when Undo restores the client', async () => {
    answerDelete(() => new HttpResponse(null, { status: 204 }));
    recordRequests('post', `${CLIENT_PATH}/restore`, () => HttpResponse.json(TEST_CLIENT));
    const queryClient = createQueryClient();
    renderWithProviders(<DeleteClientButton client={TEST_CLIENT} />, queryClient);
    await confirmDelete();
    const undo = await screen.findByRole('button', { name: 'Undo' });
    queryClient.setQueryData(taskKeys.list(OPEN_TASKS), NO_TASKS);

    // A plain click: user-event's focus change hands sonner a relatedTarget jsdom cannot focus.
    fireEvent.click(undo);

    await waitFor(() => {
      expect(queryClient.getQueryState(taskKeys.list(OPEN_TASKS))?.isInvalidated).toBe(true);
    });
  });

  it('should mark the stages stale when Undo restores the client', async () => {
    answerDelete(() => new HttpResponse(null, { status: 204 }));
    recordRequests('post', `${CLIENT_PATH}/restore`, () => HttpResponse.json(TEST_CLIENT));
    const queryClient = createQueryClient();
    renderWithProviders(<DeleteClientButton client={TEST_CLIENT} />, queryClient);
    await confirmDelete();
    const undo = await screen.findByRole('button', { name: 'Undo' });
    queryClient.setQueryData(stageKeys.list, TEST_STAGES);

    // A plain click: user-event's focus change hands sonner a relatedTarget jsdom cannot focus.
    fireEvent.click(undo);

    await waitFor(() => {
      expect(queryClient.getQueryState(stageKeys.list)?.isInvalidated).toBe(true);
    });
  });

  it('should restore and refetch the lists when Undo is pressed after the card has unmounted', async () => {
    answerDelete(() => new HttpResponse(null, { status: 204 }));
    const restores = recordRequests('post', `${CLIENT_PATH}/restore`, () =>
      HttpResponse.json(TEST_CLIENT),
    );
    const lists = recordRequests('get', '/api/clients', () => HttpResponse.json(clientPage([])));
    const { rerender } = renderWithProviders(<Screen client={TEST_CLIENT} isCardShown />);
    await confirmDelete();
    const undo = await screen.findByRole('button', { name: 'Undo' });
    rerender(<Screen client={TEST_CLIENT} isCardShown={false} />);
    const listsBeforeUndo = lists.length;

    // A plain click: user-event's focus change hands sonner a relatedTarget jsdom cannot focus.
    fireEvent.click(undo);

    expect(await screen.findByText('Client restored')).toBeInTheDocument();
    expect(restores).toHaveLength(1);
    await waitFor(() => {
      expect(lists.length).toBeGreaterThan(listsBeforeUndo);
    });
  });

  it('should close the dialog, explain and return focus to Delete when the API answers 403', async () => {
    answerDelete(() => problemResponse(403, 'CLIENT_DELETE_FORBIDDEN'));
    renderWithProviders(<DeleteClientButton client={TEST_CLIENT} />);

    await confirmDelete();

    expect(await screen.findByText('You can delete only clients you created.')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: 'Delete' })).toHaveFocus();
  });

  it('should keep the dialog open with an alert when the API fails', async () => {
    answerDelete(() => problemResponse(500, 'INTERNAL_ERROR', { requestId: 'req-500' }));
    renderWithProviders(<DeleteClientButton client={TEST_CLIENT} />);

    await confirmDelete();

    const dialog = screen.getByRole('alertdialog');
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Reference: req-500');
    expect(mockRouter.replace).not.toHaveBeenCalled();
  });

  it('should keep the dialog buttons off when the client was already deleted and the page is leaving', async () => {
    answerDelete(() => problemResponse(404, 'CLIENT_NOT_FOUND'));
    renderWithProviders(<DeleteClientButton client={TEST_CLIENT} />);

    await confirmDelete();

    expect(await screen.findByText('This client was already deleted.')).toBeInTheDocument();
    const dialog = screen.getByRole('alertdialog');
    expect(within(dialog).getByRole('button', { name: 'Delete' })).toBeDisabled();
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toBeDisabled();
  });

  it('should leave for the list and say so when the client was already deleted', async () => {
    answerDelete(() => problemResponse(404, 'CLIENT_NOT_FOUND'));
    renderWithProviders(<DeleteClientButton client={TEST_CLIENT} />);

    await confirmDelete();

    expect(await screen.findByText('This client was already deleted.')).toBeInTheDocument();
    expect(mockRouter.replace).toHaveBeenCalledWith('/clients');
  });
});
