import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { delay, HttpResponse } from 'msw';
import { beforeAll, describe, expect, it } from 'vitest';

import { dealKeys } from '@/entities/deal';
import { createQueryClient } from '@/shared/api/query-client';
import type { Board } from '@clientry/shared/deals';

import { BoardView } from './board-view';
import {
  makeBoard,
  makeDeal,
  NEW_STAGE,
  PROPOSAL_STAGE,
  WON_STAGE,
} from '../../../../../test/deals';
import { failOnceThenWait } from '../../../../../test/msw/fail-once';
import { problemResponse } from '../../../../../test/msw/problem';
import { recordRequests } from '../../../../../test/msw/record';
import { renderWithUrl } from '../../../../../test/render';

const BOARD = makeBoard([
  makeDeal(1, { stage: NEW_STAGE, amount: 450000, currency: 'USD' }),
  makeDeal(2, { stage: NEW_STAGE, amount: 120000, currency: 'EUR' }),
  makeDeal(3, { stage: WON_STAGE, closedAt: '2026-10-08T10:00:00.000Z' }),
]);
const EMPTY_BOARD = makeBoard([]);

function answerBoard(resolver: () => Response | Promise<Response>): Request[] {
  return recordRequests('get', '/api/deals/board', resolver);
}

function column(name: string): HTMLElement {
  return screen.getByRole('region', { name });
}

describe('BoardView', () => {
  // The board is a dynamic import; loaded once here, no test waits for it under a full run.
  beforeAll(async () => {
    await import('@/features/move-deal');
  });

  it('should show skeleton columns when the board is loading', () => {
    answerBoard(async () => delay('infinite').then(() => HttpResponse.json(BOARD)));

    renderWithUrl(<BoardView />);

    expect(screen.getByTestId('board-skeleton')).toBeInTheDocument();
  });

  it('should show every stage as a column with its count and totals when the board loads', async () => {
    answerBoard(() => HttpResponse.json(BOARD));

    renderWithUrl(<BoardView />);

    const first = await screen.findByRole('region', { name: 'New' });
    expect(within(first).getByText('2 deals · $4,500 · €1,200')).toBeInTheDocument();
    expect(within(first).getAllByRole('listitem')).toHaveLength(2);
    expect(within(column('Paid')).getByText('Won')).toBeInTheDocument();
    expect(within(column('Proposal sent')).getByText('No deals')).toBeInTheDocument();
    expect(
      within(column('Proposal sent')).getByRole('link', { name: 'Add deal to Proposal sent' }),
    ).toHaveAttribute('href', `/deals/new?stageId=${PROPOSAL_STAGE.id}`);
  });

  it('should say how many deals a column shows when it has more than it returned', async () => {
    const truncated: Board = {
      columns: BOARD.columns.map((item) =>
        item.stage.id === NEW_STAGE.id ? { ...item, count: 134 } : item,
      ),
    };
    answerBoard(() => HttpResponse.json(truncated));

    renderWithUrl(<BoardView />);

    expect(await screen.findByText('Showing 2 of 134 deals')).toBeInTheDocument();
  });

  it('should show the columns and the first-deal line when the workspace has no deals', async () => {
    answerBoard(() => HttpResponse.json(EMPTY_BOARD));

    renderWithUrl(<BoardView />);

    expect(
      await screen.findByText('No deals yet. Add the first one with New deal.'),
    ).toBeInTheDocument();
    for (const name of ['New', 'Call', 'Proposal sent', 'Contract', 'Paid', 'Lost']) {
      expect(column(name)).toBeInTheDocument();
    }
  });

  it('should refetch the board when Try again is pressed after an error', async () => {
    let calls = 0;
    answerBoard(() => {
      calls += 1;
      return calls === 1 ? problemResponse(400, 'VALIDATION_FAILED') : HttpResponse.json(BOARD);
    });
    const user = userEvent.setup();
    renderWithUrl(<BoardView />);

    await user.click(await screen.findByRole('button', { name: 'Try again' }));

    expect(await screen.findByRole('region', { name: 'New' })).toBeInTheDocument();
    expect(screen.queryByText('We could not load the board.')).not.toBeInTheDocument();
  });

  it('should focus the Deals heading when Try again reloads the board', async () => {
    answerBoard(failOnceThenWait(BOARD));
    const user = userEvent.setup();
    renderWithUrl(<BoardView />);

    await user.click(await screen.findByRole('button', { name: 'Try again' }));

    expect(await screen.findByTestId('board-skeleton')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Deals' })).toHaveFocus();
  });

  it('should show Edit stages when the viewer is the owner', async () => {
    answerBoard(() => HttpResponse.json(BOARD));

    renderWithUrl(<BoardView />);

    expect(await screen.findByRole('link', { name: 'Edit stages' })).toHaveAttribute(
      'href',
      '/deals/stages',
    );
  });

  describe('Only mine', () => {
    it('should press the toggle and ask for assignee=me when the URL has mine=true', async () => {
      const requests = answerBoard(() => HttpResponse.json(BOARD));

      renderWithUrl(<BoardView />, '?mine=true');

      expect(screen.getByRole('button', { name: 'Only mine' })).toHaveAttribute(
        'aria-pressed',
        'true',
      );
      await waitFor(() => {
        expect(requests).toHaveLength(1);
      });
      expect(new URL(requests[0]?.url ?? '').search).toBe('?assignee=me');
    });

    it('should filter nothing when mine has any other value', async () => {
      const requests = answerBoard(() => HttpResponse.json(BOARD));

      renderWithUrl(<BoardView />, '?mine=yes');

      expect(screen.getByRole('button', { name: 'Only mine' })).toHaveAttribute(
        'aria-pressed',
        'false',
      );
      await waitFor(() => {
        expect(requests).toHaveLength(1);
      });
      expect(new URL(requests[0]?.url ?? '').search).toBe('');
    });

    it('should write and remove mine=true and replace the history entry when toggled', async () => {
      answerBoard(() => HttpResponse.json(BOARD));
      const user = userEvent.setup();
      const { urlUpdates } = renderWithUrl(<BoardView />);
      const toggle = screen.getByRole('button', { name: 'Only mine' });

      await user.click(toggle);
      await user.click(toggle);

      await waitFor(() => {
        expect(urlUpdates).toHaveLength(2);
      });
      expect(urlUpdates.map((update) => update.queryString)).toEqual(['?mine=true', '']);
      expect(urlUpdates.every((update) => update.options.history === 'replace')).toBe(true);
    });

    it('should offer Show all deals when nothing is assigned to the caller', async () => {
      answerBoard(() => HttpResponse.json(EMPTY_BOARD));
      const user = userEvent.setup();
      const { urlUpdates } = renderWithUrl(<BoardView />, '?mine=true');

      expect(await screen.findByText('No deals are assigned to you.')).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'Show all deals' }));

      await waitFor(() => {
        expect(urlUpdates.at(-1)?.queryString).toBe('');
      });
    });

    it('should move focus to the switched-off Only mine when Show all deals is pressed', async () => {
      answerBoard(() => HttpResponse.json(EMPTY_BOARD));
      const user = userEvent.setup();
      renderWithUrl(<BoardView />, '?mine=true');

      await user.click(await screen.findByRole('button', { name: 'Show all deals' }));
      await screen.findByText('No deals yet. Add the first one with New deal.');

      const toggle = screen.getByRole('button', { name: 'Only mine' });
      expect(toggle).toHaveFocus();
      expect(toggle).toHaveAttribute('aria-pressed', 'false');
    });

    it('should not claim the workspace is empty when the full board is still loading', async () => {
      const queryClient = createQueryClient();
      queryClient.setQueryData(dealKeys.board({ isMine: true }), EMPTY_BOARD);
      answerBoard(async () => delay('infinite').then(() => HttpResponse.json(BOARD)));
      const user = userEvent.setup();
      renderWithUrl(<BoardView />, '?mine=true', queryClient);

      await user.click(await screen.findByRole('button', { name: 'Show all deals' }));

      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Only mine' })).toHaveAttribute(
          'aria-pressed',
          'false',
        );
      });
      expect(screen.queryByText(/No deals yet/)).not.toBeInTheDocument();
    });

    it('should keep the old columns busy when the filtered board is loading', async () => {
      const queryClient = createQueryClient();
      queryClient.setQueryData(dealKeys.board({ isMine: false }), BOARD);
      answerBoard(async () => delay('infinite').then(() => HttpResponse.json(EMPTY_BOARD)));
      const user = userEvent.setup();
      renderWithUrl(<BoardView />, '', queryClient);

      await user.click(screen.getByRole('button', { name: 'Only mine' }));

      const first = await screen.findByRole('region', { name: 'New' });
      await waitFor(() => {
        expect(first.closest('[aria-busy]')).toHaveAttribute('aria-busy', 'true');
      });
    });
  });
});
