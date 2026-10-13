import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { delay, HttpResponse } from 'msw';
import { beforeAll, describe, expect, it } from 'vitest';

import { dealKeys } from '@/entities/deal';
import { memberKeys } from '@/entities/member';
import { sessionKeys } from '@/entities/session';
import { createQueryClient } from '@/shared/api/query-client';
import type { SessionResponse } from '@clientry/shared/auth';
import type { Board } from '@clientry/shared/deals';
import type { MemberListResponse } from '@clientry/shared/workspaces';

import { BoardView } from './board-view';
import {
  makeBoard,
  makeDeal,
  NEW_STAGE,
  PROPOSAL_STAGE,
  TEST_MEMBERS,
  WON_STAGE,
} from '../../../../../test/deals';
import { TEST_SESSION } from '../../../../../test/fixtures';
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
const MAX = {
  id: '0199a3c4-6a7b-7c8d-9e0f-1a2b3c4d5e6f',
  name: 'Max Kim',
  email: 'max@example.com',
  role: 'manager',
  joinedAt: '2026-10-02T09:00:00.000Z',
} as const;
const FORMER_ID = '0199a3c4-0000-7000-8000-000000000000';
const TEAM: MemberListResponse = { items: [...TEST_MEMBERS.items, MAX] };

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

  it('should hide Edit stages when the viewer is a manager', async () => {
    answerBoard(() => HttpResponse.json(BOARD));
    recordRequests('get', '/api/auth/me', () =>
      HttpResponse.json({ ...TEST_SESSION, role: 'manager' }),
    );

    const { queryClient } = renderWithUrl(<BoardView />);

    await screen.findByRole('region', { name: 'New' });
    // The link follows the session, so its absence means something only once the session is in.
    await waitFor(() => {
      expect(queryClient.getQueryData<SessionResponse>(sessionKeys.current)?.role).toBe('manager');
    });
    expect(screen.queryByRole('link', { name: 'Edit stages' })).not.toBeInTheDocument();
  });

  describe('Assignee', () => {
    function answerMembers(): Request[] {
      return recordRequests('get', '/api/members', () => HttpResponse.json(TEAM));
    }

    async function boardSearch(requests: readonly Request[]): Promise<string> {
      await waitFor(() => {
        expect(requests).toHaveLength(1);
      });
      return new URL(requests[0]?.url ?? '').search;
    }

    it('should read Anyone and send no assignee when the URL has no filter', async () => {
      const requests = answerBoard(() => HttpResponse.json(BOARD));

      renderWithUrl(<BoardView />);

      expect(screen.getByRole('button', { name: 'Assignee: Anyone' })).toBeInTheDocument();
      expect(await boardSearch(requests)).toBe('');
    });

    it.each([
      ['me', '?assignee=me'],
      [MAX.id, `?assignee=${MAX.id}`],
    ])('should send the assignee when the URL has assignee=%s', async (_value, search) => {
      const requests = answerBoard(() => HttpResponse.json(BOARD));

      renderWithUrl(<BoardView />, search);

      expect(await boardSearch(requests)).toBe(search);
    });

    it('should filter nothing when the URL still has the old mine=true', async () => {
      const requests = answerBoard(() => HttpResponse.json(BOARD));

      renderWithUrl(<BoardView />, '?mine=true');

      expect(await boardSearch(requests)).toBe('');
    });

    it('should write the member id and replace the history entry when a member is chosen', async () => {
      answerBoard(() => HttpResponse.json(BOARD));
      answerMembers();
      const user = userEvent.setup();
      const { urlUpdates } = renderWithUrl(<BoardView />);

      await user.click(screen.getByRole('button', { name: 'Assignee: Anyone' }));
      await user.click(await screen.findByRole('menuitemradio', { name: 'Max Kim' }));

      await waitFor(() => {
        expect(urlUpdates.at(-1)?.queryString).toBe(`?assignee=${MAX.id}`);
      });
      expect(urlUpdates.every((update) => update.options.history === 'replace')).toBe(true);
      expect(screen.getByRole('button', { name: 'Assignee: Max Kim' })).toHaveFocus();
    });

    it('should offer Show all deals when nothing is assigned to the caller', async () => {
      answerBoard(() => HttpResponse.json(EMPTY_BOARD));
      const user = userEvent.setup();
      const { urlUpdates } = renderWithUrl(<BoardView />, '?assignee=me');

      expect(await screen.findByText('No deals are assigned to you.')).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'Show all deals' }));

      await waitFor(() => {
        expect(urlUpdates.at(-1)?.queryString).toBe('');
      });
    });

    it('should name the member when nothing is assigned to them', async () => {
      answerBoard(() => HttpResponse.json(EMPTY_BOARD));
      const queryClient = createQueryClient();
      queryClient.setQueryData(memberKeys.list, TEAM);

      renderWithUrl(<BoardView />, `?assignee=${MAX.id}`, queryClient);

      expect(await screen.findByText('No deals are assigned to Max Kim.')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Show all deals' })).toBeInTheDocument();
    });

    it('should say you and ask for no members when the URL holds the caller own id', async () => {
      answerBoard(() => HttpResponse.json(EMPTY_BOARD));
      const members = answerMembers();
      const queryClient = createQueryClient();
      queryClient.setQueryData(sessionKeys.current, TEST_SESSION);

      renderWithUrl(<BoardView />, `?assignee=${TEST_SESSION.user.id}`, queryClient);

      expect(await screen.findByText('No deals are assigned to you.')).toBeInTheDocument();
      expect(members).toHaveLength(0);
    });

    it('should say this member when nothing is assigned to a former member', async () => {
      answerBoard(() => HttpResponse.json(EMPTY_BOARD));
      const queryClient = createQueryClient();
      queryClient.setQueryData(memberKeys.list, TEAM);

      renderWithUrl(<BoardView />, `?assignee=${FORMER_ID}`, queryClient);

      expect(await screen.findByText('No deals are assigned to this member.')).toBeInTheDocument();
    });

    it('should move focus to the menu on Anyone when Show all deals is pressed', async () => {
      answerBoard(() => HttpResponse.json(EMPTY_BOARD));
      const user = userEvent.setup();
      renderWithUrl(<BoardView />, '?assignee=me');

      await user.click(await screen.findByRole('button', { name: 'Show all deals' }));
      await screen.findByText('No deals yet. Add the first one with New deal.');

      expect(screen.getByRole('button', { name: 'Assignee: Anyone' })).toHaveFocus();
    });

    it('should not claim the workspace is empty when the full board is still loading', async () => {
      const queryClient = createQueryClient();
      queryClient.setQueryData(dealKeys.board({ assignee: 'me' }), EMPTY_BOARD);
      answerBoard(async () => delay('infinite').then(() => HttpResponse.json(BOARD)));
      const user = userEvent.setup();
      renderWithUrl(<BoardView />, '?assignee=me', queryClient);

      await user.click(await screen.findByRole('button', { name: 'Show all deals' }));

      await screen.findByRole('button', { name: 'Assignee: Anyone' });
      expect(screen.queryByText(/No deals yet/)).not.toBeInTheDocument();
    });

    it('should keep the old columns busy when the filtered board is loading', async () => {
      const queryClient = createQueryClient();
      queryClient.setQueryData(dealKeys.board({ assignee: null }), BOARD);
      answerBoard(async () => delay('infinite').then(() => HttpResponse.json(EMPTY_BOARD)));
      answerMembers();
      const user = userEvent.setup();
      renderWithUrl(<BoardView />, '', queryClient);

      await user.click(screen.getByRole('button', { name: 'Assignee: Anyone' }));
      await user.click(await screen.findByRole('menuitemradio', { name: 'Me' }));

      const first = await screen.findByRole('region', { name: 'New' });
      await waitFor(() => {
        expect(first.closest('[aria-busy]')).toHaveAttribute('aria-busy', 'true');
      });
    });
  });
});
