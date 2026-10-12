import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';

import { dealKeys, stageKeys } from '@/entities/deal';
import { taskKeys } from '@/entities/task';
import { createQueryClient } from '@/shared/api/query-client';
import { requestHeadingFocus } from '@/shared/lib/heading-focus';
import { dealHistoryResponseSchema } from '@clientry/shared/deals';
import type { DealHistoryResponse } from '@clientry/shared/deals';

import { DealView } from './deal-view';
import { OTHER_USER } from '../../../../../../test/clients';
import { CALL_STAGE, NEW_STAGE, TEST_DEAL, TEST_STAGES } from '../../../../../../test/deals';
import { held } from '../../../../../../test/held';
import { failOnceThenAnswer, failOnceThenWait } from '../../../../../../test/msw/fail-once';
import { problemResponse } from '../../../../../../test/msw/problem';
import { recordRequests } from '../../../../../../test/msw/record';
import { renderWithProviders } from '../../../../../../test/render';
import { makeTask, makeTaskPage } from '../../../../../../test/tasks';
import { taskSectionFilters } from '../../../_lib/task-section-filters';

const ANN = TEST_DEAL.assignee;
const ROMASHKA = TEST_DEAL.client;
const LILY = { id: '0199a3c4-7d10-7c2e-9a4b-000000000099', name: 'Lily Inc' };

function entry(index: number, event: object): object {
  return {
    id: `0199b1f0-0000-7000-8000-${String(index).padStart(12, '0')}`,
    actor: ANN,
    createdAt: '2026-10-09T11:05:00.000Z',
    ...event,
  };
}

const HISTORY: DealHistoryResponse = dealHistoryResponseSchema.parse({
  items: [
    entry(1, { type: 'deal_restored', payload: {} }),
    entry(2, { type: 'deal_deleted', payload: {} }),
    entry(3, {
      type: 'deal_updated',
      payload: {
        changes: [
          { field: 'title', from: 'Landing', to: 'Landing page' },
          {
            field: 'amount',
            from: { amount: 100000, currency: 'USD' },
            to: { amount: 150050, currency: 'EUR' },
          },
          { field: 'client', from: LILY, to: ROMASHKA },
          { field: 'assignee', from: OTHER_USER, to: ANN },
        ],
      },
    }),
    entry(4, {
      type: 'deal_moved',
      payload: { from: CALL_STAGE, to: NEW_STAGE, reason: 'stage_deleted' },
    }),
    entry(5, { type: 'deal_moved', payload: { from: NEW_STAGE, to: CALL_STAGE } }),
    entry(6, {
      type: 'deal_created',
      payload: { stage: NEW_STAGE, amount: 100000, currency: 'USD' },
    }),
  ],
  hasMore: true,
});

// The first read of the deal fails; the next one answers once the gate opens.
function answerDealAfterFailure(answer: () => Response, gate?: Promise<void>): void {
  recordRequests('get', `/api/deals/${TEST_DEAL.id}`, failOnceThenAnswer(answer, gate));
  recordRequests('get', `/api/deals/${TEST_DEAL.id}/history`, () => HttpResponse.json(HISTORY));
}

function renderPage(queryClient = createQueryClient()): ReturnType<typeof renderWithProviders> {
  queryClient.setQueryData(dealKeys.detail(TEST_DEAL.id), TEST_DEAL);
  queryClient.setQueryData(dealKeys.history(TEST_DEAL.id), HISTORY);
  return renderWithProviders(<DealView id={TEST_DEAL.id} />, queryClient);
}

describe('DealView', () => {
  beforeEach(() => {
    recordRequests('get', '/api/tasks', () => HttpResponse.json(makeTaskPage([])));
  });

  it('should list the open tasks with assignees and offer a new task for the deal', () => {
    const queryClient = createQueryClient();
    const task = makeTask(1);
    queryClient.setQueryData(taskKeys.list(taskSectionFilters({ dealId: TEST_DEAL.id })), {
      pages: [makeTaskPage([task])],
      pageParams: [null],
    });

    renderPage(queryClient);

    const section = screen.getByRole('region', { name: 'Tasks' });
    expect(within(section).getByRole('link', { name: task.title })).toHaveAttribute(
      'href',
      `/tasks/${task.id}`,
    );
    expect(within(section).getByText(task.assignee.name)).toBeInTheDocument();
    expect(within(section).queryByRole('link', { name: /^Deal / })).not.toBeInTheDocument();
    expect(within(section).getByRole('link', { name: 'New task' })).toHaveAttribute(
      'href',
      `/tasks/new?dealId=${TEST_DEAL.id}`,
    );
  });

  it('should say the deal has no open tasks when the list is empty', async () => {
    renderPage();

    const section = screen.getByRole('region', { name: 'Tasks' });
    expect(await within(section).findByText('No open tasks')).toBeInTheDocument();
  });

  it('should show the details and link the client when the deal loads', () => {
    renderPage();

    expect(screen.getByRole('heading', { level: 1, name: TEST_DEAL.title })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: ROMASHKA.name })).toHaveAttribute(
      'href',
      `/clients/${ROMASHKA.id}`,
    );
    expect(screen.getByText('$1,500')).toBeInTheDocument();
  });

  it('should focus the deal title when the page opens after a create or a save', () => {
    requestHeadingFocus();

    renderPage();

    expect(screen.getByRole('heading', { level: 1, name: TEST_DEAL.title })).toHaveFocus();
  });

  it('should describe each entry when the history has every kind', () => {
    renderPage();

    for (const line of [
      'Ann Lee restored the deal',
      'Ann Lee deleted the deal',
      'Ann Lee renamed the deal from “Landing” to “Landing page”',
      'Ann Lee changed the amount from $1,000 to €1,500.50',
      'Ann Lee changed the client from Lily Inc to Romashka LLC',
      'Ann Lee changed the assignee from Max Kay to Ann Lee',
      'Ann Lee moved the deal from Call to New when Call was deleted',
      'Ann Lee moved the deal from New to Call',
      'Ann Lee created the deal in New · $1,000',
      'Older changes are not shown.',
    ]) {
      expect(screen.getByText(line)).toBeInTheDocument();
    }
  });

  it('should move the deal to the chosen stage and show it when the stage select changes', async () => {
    const requests = recordRequests('post', `/api/deals/${TEST_DEAL.id}/move`, () =>
      HttpResponse.json({ ...TEST_DEAL, stage: CALL_STAGE, version: 4 }),
    );
    recordRequests('get', `/api/deals/${TEST_DEAL.id}/history`, () => HttpResponse.json(HISTORY));
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole('combobox', { name: 'Stage' }));
    await user.click(await screen.findByRole('option', { name: 'Call' }));

    await waitFor(() => {
      expect(screen.getByRole('combobox', { name: 'Stage' })).toHaveTextContent('Call');
    });
    expect(await requests[0]?.json()).toEqual({
      version: TEST_DEAL.version,
      stageId: CALL_STAGE.id,
      afterId: null,
    });
  });

  it('should send the reloaded version when the stage is chosen again after a conflict', async () => {
    const changed = { ...TEST_DEAL, title: 'Landing page v2', version: 5 };
    const requests = recordRequests('post', `/api/deals/${TEST_DEAL.id}/move`, () =>
      requests.length === 1
        ? problemResponse(409, 'DEAL_CHANGED')
        : HttpResponse.json({ ...changed, stage: CALL_STAGE, version: 6 }),
    );
    recordRequests('get', `/api/deals/${TEST_DEAL.id}`, () => HttpResponse.json(changed));
    recordRequests('get', `/api/deals/${TEST_DEAL.id}/history`, () => HttpResponse.json(HISTORY));
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole('combobox', { name: 'Stage' }));
    await user.click(await screen.findByRole('option', { name: 'Call' }));
    expect(
      await screen.findByRole('heading', { level: 1, name: changed.title }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('combobox', { name: 'Stage' }));
    await user.click(await screen.findByRole('option', { name: 'Call' }));

    await waitFor(() => {
      expect(requests).toHaveLength(2);
    });
    expect(await requests[1]?.json()).toEqual({
      version: changed.version,
      stageId: CALL_STAGE.id,
      afterId: null,
    });
  });

  it('should say the page is updated when the stage change meets a deal changed elsewhere', async () => {
    recordRequests('post', `/api/deals/${TEST_DEAL.id}/move`, () =>
      problemResponse(409, 'DEAL_CHANGED'),
    );
    recordRequests('get', `/api/deals/${TEST_DEAL.id}`, () => HttpResponse.json(TEST_DEAL));
    recordRequests('get', `/api/deals/${TEST_DEAL.id}/history`, () => HttpResponse.json(HISTORY));
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole('combobox', { name: 'Stage' }));
    await user.click(await screen.findByRole('option', { name: 'Call' }));

    expect(
      await screen.findByText('This deal was changed by someone else. The page is updated.'),
    ).toBeInTheDocument();
  });

  it('should show the deal stage when the cached stage list lacks it', () => {
    const queryClient = createQueryClient();
    queryClient.setQueryData(stageKeys.list, {
      items: TEST_STAGES.items.filter((stage) => stage.id !== TEST_DEAL.stage.id),
    });

    renderPage(queryClient);

    expect(screen.getByRole('combobox', { name: 'Stage' })).toHaveTextContent(TEST_DEAL.stage.name);
  });

  it('should show the not found state when a move finds the deal gone', async () => {
    recordRequests('post', `/api/deals/${TEST_DEAL.id}/move`, () =>
      problemResponse(404, 'DEAL_NOT_FOUND'),
    );
    recordRequests('get', `/api/deals/${TEST_DEAL.id}`, () =>
      problemResponse(404, 'DEAL_NOT_FOUND'),
    );
    recordRequests('get', `/api/deals/${TEST_DEAL.id}/history`, () =>
      problemResponse(404, 'DEAL_NOT_FOUND'),
    );
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole('combobox', { name: 'Stage' }));
    await user.click(await screen.findByRole('option', { name: 'Call' }));

    expect(await screen.findByRole('heading', { name: 'Deal not found' })).toBeInTheDocument();
  });

  it('should focus the History heading when Try again reloads the history', async () => {
    recordRequests('get', `/api/deals/${TEST_DEAL.id}/history`, failOnceThenWait(HISTORY));
    const queryClient = createQueryClient();
    queryClient.setQueryData(dealKeys.detail(TEST_DEAL.id), TEST_DEAL);
    const user = userEvent.setup();
    renderWithProviders(<DealView id={TEST_DEAL.id} />, queryClient);

    await user.click(await screen.findByRole('button', { name: 'Try again' }));

    expect(await screen.findByTestId('deal-history-skeleton')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'History' })).toHaveFocus();
  });

  it('should focus the box the deal loads into when Try again reloads the deal', async () => {
    recordRequests('get', `/api/deals/${TEST_DEAL.id}`, failOnceThenWait(TEST_DEAL));
    const user = userEvent.setup();
    renderWithProviders(<DealView id={TEST_DEAL.id} />);

    await user.click(await screen.findByRole('button', { name: 'Try again' }));

    const skeleton = await screen.findByTestId('deal-details-skeleton');
    expect(skeleton.parentElement).toHaveFocus();
  });

  it('should hand the focus from the box to the deal title when Try again loads the deal', async () => {
    const gate = held();
    answerDealAfterFailure(() => HttpResponse.json(TEST_DEAL), gate.promise);
    const user = userEvent.setup();
    renderWithProviders(<DealView id={TEST_DEAL.id} />);
    await user.click(await screen.findByRole('button', { name: 'Try again' }));
    const box = (await screen.findByTestId('deal-details-skeleton')).parentElement;
    expect(box).toHaveFocus();

    gate.release();

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1, name: TEST_DEAL.title })).toHaveFocus();
    });
    expect(box).not.toHaveAttribute('tabindex');
  });

  it('should hand the focus from the box to the not found heading when Try again finds the deal gone', async () => {
    answerDealAfterFailure(() => problemResponse(404, 'DEAL_NOT_FOUND'));
    const user = userEvent.setup();
    renderWithProviders(<DealView id={TEST_DEAL.id} />);

    await user.click(await screen.findByRole('button', { name: 'Try again' }));

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1, name: 'Deal not found' })).toHaveFocus();
    });
  });

  it('should keep the focus on the box, still focusable, when Try again fails again', async () => {
    const gate = held();
    answerDealAfterFailure(() => problemResponse(400, 'VALIDATION_FAILED'), gate.promise);
    const user = userEvent.setup();
    renderWithProviders(<DealView id={TEST_DEAL.id} />);
    await user.click(await screen.findByRole('button', { name: 'Try again' }));
    const box = (await screen.findByTestId('deal-details-skeleton')).parentElement;

    gate.release();

    expect(await screen.findByRole('button', { name: 'Try again' })).toBeInTheDocument();
    expect(box).toHaveFocus();
    // A browser drops focus to the body when the focused box stops being focusable.
    expect(box).toHaveAttribute('tabindex', '-1');
  });

  it('should leave the focus on the page when plain text of the loaded deal is clicked', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByText('$1,500'));

    expect(document.body).toHaveFocus();
  });

  it('should leave the focus on the page when plain text is clicked after Try again loaded the deal', async () => {
    answerDealAfterFailure(() => HttpResponse.json(TEST_DEAL));
    const user = userEvent.setup();
    renderWithProviders(<DealView id={TEST_DEAL.id} />);
    await user.click(await screen.findByRole('button', { name: 'Try again' }));
    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1, name: TEST_DEAL.title })).toHaveFocus();
    });

    await user.click(screen.getByText('$1,500'));

    expect(document.body).toHaveFocus();
  });

  it('should show the not found state when the deal is gone', async () => {
    recordRequests('get', `/api/deals/${TEST_DEAL.id}`, () =>
      problemResponse(404, 'DEAL_NOT_FOUND'),
    );
    recordRequests('get', `/api/deals/${TEST_DEAL.id}/history`, () =>
      problemResponse(404, 'DEAL_NOT_FOUND'),
    );

    renderWithProviders(<DealView id={TEST_DEAL.id} />);

    expect(await screen.findByRole('heading', { name: 'Deal not found' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to deals' })).toHaveAttribute('href', '/deals');
  });
});
