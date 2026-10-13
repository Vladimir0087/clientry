import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse } from 'msw';
import type * as React from 'react';
import { describe, expect, it } from 'vitest';

import { dealKeys, stageKeys, useStages } from '@/entities/deal';
import { taskKeys, useTasks } from '@/entities/task';
import type { TaskFilters } from '@/entities/task';
import { createQueryClient } from '@/shared/api/query-client';
import type { Deal } from '@clientry/shared/deals';

import { DeleteDealButton } from './delete-deal-button';
import { OTHER_USER } from '../../../../test/clients';
import { TEST_DEAL, TEST_STAGES } from '../../../../test/deals';
import { TEST_SESSION } from '../../../../test/fixtures';
import { mockRouter } from '../../../../test/mocks/router';
import { problemResponse } from '../../../../test/msw/problem';
import { recordRequests } from '../../../../test/msw/record';
import type { Resolver } from '../../../../test/msw/record';
import { renderWithProviders } from '../../../../test/render';

const DEAL_PATH = `/api/deals/${TEST_DEAL.id}`;
const MANAGER_SESSION = { ...TEST_SESSION, role: 'manager' as const };
const OTHERS_DEAL: Deal = { ...TEST_DEAL, createdBy: OTHER_USER };
const DEAL_TASKS: TaskFilters = { assignee: null, status: 'open', dealId: TEST_DEAL.id };
const NO_TASKS = { pages: [{ items: [], nextCursor: null }], pageParams: [null] };

function DealPage({ isShown }: { readonly isShown: boolean }): React.JSX.Element | null {
  return isShown ? <DeleteDealButton deal={TEST_DEAL} /> : null;
}

// The deal page keeps its tasks mounted while the route is being replaced.
function DealPageWithTasks(): React.JSX.Element {
  useTasks(DEAL_TASKS);
  return <DeleteDealButton deal={TEST_DEAL} />;
}

// The deal page's stage select, which leaves with the page.
function StageSelectStandIn(): React.JSX.Element | null {
  const stages = useStages();
  return stages.data === undefined ? null : <p>Stages loaded</p>;
}

function answerDelete(resolver: Resolver): Request[] {
  return recordRequests('delete', DEAL_PATH, resolver);
}

function answerSession(session: object): Request[] {
  return recordRequests('get', '/api/auth/me', () => HttpResponse.json(session));
}

async function confirmDelete(): Promise<void> {
  await userEvent.click(await screen.findByRole('button', { name: 'Delete' }));
  const dialog = await screen.findByRole('alertdialog');
  await userEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));
}

describe('DeleteDealButton', () => {
  it('should hide Delete when a manager looks at a deal someone else created', async () => {
    answerSession(MANAGER_SESSION);

    renderWithProviders(
      <>
        <section aria-label="Own deal">
          <DeleteDealButton deal={TEST_DEAL} />
        </section>
        <section aria-label="Other deal">
          <DeleteDealButton deal={OTHERS_DEAL} />
        </section>
      </>,
    );

    // The own deal's Delete shows once the session has loaded.
    const own = within(screen.getByRole('region', { name: 'Own deal' }));
    expect(await own.findByRole('button', { name: 'Delete' })).toBeInTheDocument();
    const other = within(screen.getByRole('region', { name: 'Other deal' }));
    expect(other.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument();
  });

  it.each([
    ['a manager looks at their own deal', MANAGER_SESSION, TEST_DEAL],
    ['the owner looks at a manager deal', TEST_SESSION, OTHERS_DEAL],
  ])('should show Delete when %s', async (_case, session, deal) => {
    answerSession(session);

    renderWithProviders(<DeleteDealButton deal={deal} />);

    expect(await screen.findByRole('button', { name: 'Delete' })).toBeInTheDocument();
  });

  it('should delete, leave for the board and offer Undo when confirmed', async () => {
    const deletes = answerDelete(() => new HttpResponse(null, { status: 204 }));
    const queryClient = createQueryClient();
    queryClient.setQueryData(dealKeys.detail(TEST_DEAL.id), TEST_DEAL);
    renderWithProviders(<DealPage isShown />, queryClient);

    await confirmDelete();

    expect(await screen.findByText('Deal deleted')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Undo' })).toBeInTheDocument();
    expect(deletes).toHaveLength(1);
    expect(mockRouter.replace).toHaveBeenCalledWith('/deals');
    expect(queryClient.getQueryState(dealKeys.detail(TEST_DEAL.id))?.isInvalidated).toBe(true);
  });

  it('should mark the stages stale without refetching them when the deal is deleted', async () => {
    answerDelete(() => new HttpResponse(null, { status: 204 }));
    const stageRequests = recordRequests('get', '/api/stages', () =>
      HttpResponse.json(TEST_STAGES),
    );
    const queryClient = createQueryClient();
    renderWithProviders(
      <>
        <StageSelectStandIn />
        <DealPage isShown />
      </>,
      queryClient,
    );
    await screen.findByText('Stages loaded');

    await confirmDelete();

    await screen.findByText('Deal deleted');
    expect(queryClient.getQueryState(stageKeys.list)?.isInvalidated).toBe(true);
    expect(stageRequests).toHaveLength(1);
  });

  it('should say the tasks go with the deal and mark them stale without a refetch when confirmed', async () => {
    answerDelete(() => new HttpResponse(null, { status: 204 }));
    const taskReads = recordRequests('get', '/api/tasks', () =>
      HttpResponse.json({ items: [], nextCursor: null }),
    );
    const queryClient = createQueryClient();
    queryClient.setQueryData(taskKeys.list(DEAL_TASKS), NO_TASKS);
    renderWithProviders(<DealPageWithTasks />, queryClient);

    await userEvent.click(await screen.findByRole('button', { name: 'Delete' }));
    expect(await screen.findByRole('alertdialog')).toHaveAccessibleDescription(
      "The deal and its tasks disappear from the board and the client's deals. You can undo this right after.",
    );
    await userEvent.click(
      within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Delete' }),
    );

    await screen.findByText('Deal deleted');
    expect(queryClient.getQueryState(taskKeys.list(DEAL_TASKS))).toMatchObject({
      isInvalidated: true,
      fetchStatus: 'idle',
    });
    expect(taskReads).toHaveLength(0);
  });

  it('should mark the tasks stale when Undo restores the deal', async () => {
    answerDelete(() => new HttpResponse(null, { status: 204 }));
    recordRequests('post', `${DEAL_PATH}/restore`, () => HttpResponse.json(TEST_DEAL));
    const queryClient = createQueryClient();
    renderWithProviders(<DealPage isShown />, queryClient);
    await confirmDelete();
    const undo = await screen.findByRole('button', { name: 'Undo' });
    queryClient.setQueryData(taskKeys.list(DEAL_TASKS), NO_TASKS);

    // A plain click: user-event's focus change hands sonner a relatedTarget jsdom cannot focus.
    fireEvent.click(undo);

    await waitFor(() => {
      expect(queryClient.getQueryState(taskKeys.list(DEAL_TASKS))?.isInvalidated).toBe(true);
    });
  });

  it('should keep the dialog buttons off when the delete succeeded and the page is leaving', async () => {
    answerDelete(() => new HttpResponse(null, { status: 204 }));
    renderWithProviders(<DealPage isShown />);

    await confirmDelete();

    expect(await screen.findByText('Deal deleted')).toBeInTheDocument();
    const dialog = screen.getByRole('alertdialog');
    expect(within(dialog).getByRole('button', { name: 'Delete' })).toBeDisabled();
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toBeDisabled();
  });

  it('should restore when Undo is pressed after the deal page has unmounted', async () => {
    answerDelete(() => new HttpResponse(null, { status: 204 }));
    const restores = recordRequests('post', `${DEAL_PATH}/restore`, () =>
      HttpResponse.json(TEST_DEAL),
    );
    const { rerender } = renderWithProviders(<DealPage isShown />);
    await confirmDelete();
    const undo = await screen.findByRole('button', { name: 'Undo' });
    rerender(<DealPage isShown={false} />);

    // A plain click: user-event's focus change hands sonner a relatedTarget jsdom cannot focus.
    fireEvent.click(undo);

    expect(await screen.findByText('Deal restored')).toBeInTheDocument();
    expect(restores).toHaveLength(1);
  });

  it('should close the dialog, explain and return focus to Delete when the API answers 403', async () => {
    answerDelete(() => problemResponse(403, 'DEAL_DELETE_FORBIDDEN'));
    renderWithProviders(<DeleteDealButton deal={TEST_DEAL} />);

    await confirmDelete();

    expect(await screen.findByText('You can delete only deals you created.')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: 'Delete' })).toHaveFocus();
  });

  it('should keep the dialog open with an alert when the API fails', async () => {
    answerDelete(() => problemResponse(500, 'INTERNAL_ERROR', { requestId: 'req-500' }));
    renderWithProviders(<DeleteDealButton deal={TEST_DEAL} />);

    await confirmDelete();

    const dialog = screen.getByRole('alertdialog');
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Reference: req-500');
    expect(mockRouter.replace).not.toHaveBeenCalled();
  });

  it('should keep the dialog buttons off when the deal was already deleted and the page is leaving', async () => {
    answerDelete(() => problemResponse(404, 'DEAL_NOT_FOUND'));
    renderWithProviders(<DealPage isShown />);

    await confirmDelete();

    expect(await screen.findByText('This deal was already deleted.')).toBeInTheDocument();
    const dialog = screen.getByRole('alertdialog');
    expect(within(dialog).getByRole('button', { name: 'Delete' })).toBeDisabled();
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toBeDisabled();
  });

  it('should leave for the board and say so when the deal was already deleted', async () => {
    answerDelete(() => problemResponse(404, 'DEAL_NOT_FOUND'));
    renderWithProviders(<DeleteDealButton deal={TEST_DEAL} />);

    await confirmDelete();

    expect(await screen.findByText('This deal was already deleted.')).toBeInTheDocument();
    expect(mockRouter.replace).toHaveBeenCalledWith('/deals');
  });
});
