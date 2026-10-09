import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse } from 'msw';
import type * as React from 'react';
import { describe, expect, it } from 'vitest';

import { clientKeys, DEFAULT_CLIENT_FILTERS, useClientList } from '@/entities/client';
import { createQueryClient } from '@/shared/api/query-client';
import type { Client } from '@clientry/shared/clients';

import { DeleteClientButton } from './delete-client-button';
import { clientPage, OTHER_USER, TEST_CLIENT } from '../../../../test/clients';
import { TEST_SESSION } from '../../../../test/fixtures';
import { mockRouter } from '../../../../test/mocks/router';
import { problemResponse } from '../../../../test/msw/problem';
import { recordRequests } from '../../../../test/msw/record';
import type { Resolver } from '../../../../test/msw/record';
import { renderWithProviders } from '../../../../test/render';

const CLIENT_PATH = `/api/clients/${TEST_CLIENT.id}`;
const MANAGER_SESSION = { ...TEST_SESSION, role: 'manager' as const };
const OTHERS_CLIENT: Client = { ...TEST_CLIENT, createdBy: OTHER_USER };

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
    const requests = recordRequests('get', '/api/auth/me', () =>
      HttpResponse.json(MANAGER_SESSION),
    );
    renderWithProviders(<DeleteClientButton client={OTHERS_CLIENT} />);

    await waitFor(() => {
      expect(requests).toHaveLength(1);
    });
    expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument();
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

  it('should leave for the list and say so when the client was already deleted', async () => {
    answerDelete(() => problemResponse(404, 'CLIENT_NOT_FOUND'));
    renderWithProviders(<DeleteClientButton client={TEST_CLIENT} />);

    await confirmDelete();

    expect(await screen.findByText('This client was already deleted.')).toBeInTheDocument();
    expect(mockRouter.replace).toHaveBeenCalledWith('/clients');
  });
});
