import { focusManager, notifyManager, onlineManager, QueryObserver } from '@tanstack/react-query';
import type { QueryClient } from '@tanstack/react-query';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { delay, HttpResponse } from 'msw';
import type * as React from 'react';
import { toast } from 'sonner';
import { describe, expect, it, onTestFinished, vi } from 'vitest';

import { dealKeys, useBoard } from '@/entities/deal';
import { createQueryClient } from '@/shared/api/query-client';
import { PageHeading } from '@/shared/ui/page-heading';
import type { Deal } from '@clientry/shared/deals';

import { DealBoard } from './deal-board';
import {
  CALL_STAGE,
  makeBoard,
  makeDeal,
  NEW_STAGE,
  PROPOSAL_STAGE,
  WON_STAGE,
} from '../../../../test/deals';
import { held } from '../../../../test/held';
import { mockRouter } from '../../../../test/mocks/router';
import { problemResponse } from '../../../../test/msw/problem';
import { recordRequests } from '../../../../test/msw/record';
import type { Resolver } from '../../../../test/msw/record';
import { renderWithProviders } from '../../../../test/render';

const DEAL = makeDeal(1, { stage: NEW_STAGE, version: 3 });
const BOARD = makeBoard([DEAL]);
const FILTERS = { assignee: null };
const HEADING_ID = 'deals-heading';
const CHANGED_MESSAGE = 'This deal was changed by someone else. The board is updated.';

function BoardHarness({ isStale }: { readonly isStale: boolean }): React.JSX.Element {
  const board = useBoard(FILTERS);
  return (
    <>
      <PageHeading id={HEADING_ID}>Deals</PageHeading>
      {board.data !== undefined && (
        <DealBoard board={board.data} headingId={HEADING_ID} isStale={isStale} />
      )}
    </>
  );
}

function renderBoard({ isStale = false, board = BOARD } = {}): ReturnType<
  typeof renderWithProviders
> {
  const queryClient = createQueryClient();
  queryClient.setQueryData(dealKeys.board(FILTERS), board);
  return renderWithProviders(<BoardHarness isStale={isStale} />, queryClient);
}

function answerMove(resolver: Resolver): Request[] {
  return recordRequests('post', `/api/deals/${DEAL.id}/move`, resolver);
}

function movedTo(stage: typeof CALL_STAGE, version: number): Deal {
  return { ...DEAL, stage, version };
}

async function moveFromMenu(
  user: ReturnType<typeof userEvent.setup>,
  stage: string,
  title = DEAL.title,
): Promise<void> {
  await user.click(screen.getByRole('button', { name: `Actions for ${title}` }));
  await user.click(await screen.findByRole('menuitemradio', { name: stage }));
}

// Refetches on every focus and reconnect in the same pass as the board, so once it has, the board
// has had its chance too.
function startRefetchProbe(queryClient: QueryClient): () => number {
  let fetches = 0;
  const probe = new QueryObserver(queryClient, {
    queryKey: ['refetch-probe'],
    queryFn: () => {
      fetches += 1;
      return Promise.resolve(fetches);
    },
    staleTime: 0,
  });
  onTestFinished(probe.subscribe(() => undefined));
  return () => fetches;
}

const COLUMN_STEP_PX = 150;
const CARD_STEP_PX = 100;
const BOARD_TOP_PX = 100;

function rectAt(left: number, top: number, width: number, height: number): DOMRect {
  const edges = { left, top, width, height, right: left + width, bottom: top + height };
  return { ...edges, x: left, y: top, toJSON: () => edges };
}

// jsdom lays nothing out; dnd-kit sees columns side by side and each column's cards stacked.
function boardRectOf(element: Element): DOMRect {
  const columns = [...document.querySelectorAll('section[aria-labelledby]')];
  const column = columns.findIndex((section) => section.contains(element));
  const left = column * COLUMN_STEP_PX;
  if (column !== -1 && element.tagName === 'LI') {
    const index = [...(element.parentElement?.children ?? [])].indexOf(element);
    return rectAt(left, BOARD_TOP_PX + index * CARD_STEP_PX, 140, 90);
  }
  if (column !== -1 && element.tagName === 'DIV' && element.parentElement === columns[column]) {
    return rectAt(left, BOARD_TOP_PX, 140, 400);
  }
  return rectAt(0, 0, 0, 0);
}

function layOutBoard(): void {
  const spy = vi
    .spyOn(Element.prototype, 'getBoundingClientRect')
    .mockImplementation(function measure(this: Element) {
      return boardRectOf(this);
    });
  onTestFinished(() => {
    spy.mockRestore();
  });
}

function pointerInit(clientX: number, clientY: number): PointerEventInit {
  return { clientX, clientY, isPrimary: true, button: 0 };
}

// The column's droppable box, which wraps its list of cards.
function dropZoneOf(stage: string): HTMLElement | null {
  return within(screen.getByRole('region', { name: stage })).getByRole('list').parentElement;
}

function cardIn(stage: string): HTMLElement | null {
  return within(screen.getByRole('region', { name: stage })).queryByRole('link', {
    name: DEAL.title,
  });
}

function menuIn(stage: string): HTMLElement {
  return within(screen.getByRole('region', { name: stage })).getByRole('button', {
    name: `Actions for ${DEAL.title}`,
  });
}

function handleIn(stage: string): HTMLElement {
  return within(screen.getByRole('region', { name: stage })).getByRole('button', {
    name: `Drag ${DEAL.title}`,
  });
}

// Lifts the card past the drag threshold and drops it in the empty Call column. The overlay
// measures as a point here, so the pointer aims at the middle of Call's drop zone.
async function dragToCall(): Promise<void> {
  const target = pointerInit(COLUMN_STEP_PX + 70, BOARD_TOP_PX + 200);
  fireEvent.pointerDown(handleIn('New'), pointerInit(0, 0));
  fireEvent.pointerMove(document, pointerInit(0, 10));
  fireEvent.pointerMove(document, target);
  await waitFor(() => {
    expect(cardIn('Call')).toBeInTheDocument();
  });
  fireEvent.pointerUp(document, target);
}

// Resolves after every callback the query client has scheduled so far, a focus request included.
async function flushScheduled(): Promise<void> {
  await act(
    () =>
      new Promise<void>((resolve) => {
        notifyManager.schedule(resolve);
      }),
  );
}

describe('DealBoard', () => {
  describe('layout', () => {
    it('should make the scroller the containing block when cards hold absolutely positioned text', () => {
      renderBoard();

      const scroller = screen.getByRole('region', { name: 'New' }).parentElement?.parentElement;

      expect(scroller).toHaveClass('relative', 'overflow-x-auto');
    });
  });

  describe('move menu', () => {
    it('should move the card before the response and send the version when a stage is chosen', async () => {
      const requests = answerMove(async () =>
        delay('infinite').then(() => HttpResponse.json(movedTo(CALL_STAGE, 4))),
      );
      const user = userEvent.setup();
      renderBoard();

      await moveFromMenu(user, 'Call');

      await waitFor(() => {
        expect(cardIn('Call')).toBeInTheDocument();
      });
      expect(cardIn('New')).not.toBeInTheDocument();
      await waitFor(() => {
        expect(requests).toHaveLength(1);
      });
      expect(await requests[0]?.json()).toEqual({
        version: 3,
        stageId: CALL_STAGE.id,
        afterId: null,
      });
    });

    it('should put the card back with focus, explain and refetch when the deal changed elsewhere', async () => {
      answerMove(() => problemResponse(409, 'DEAL_CHANGED'));
      const boardReads = recordRequests('get', '/api/deals/board', () => HttpResponse.json(BOARD));
      const user = userEvent.setup();
      renderBoard();

      await moveFromMenu(user, 'Call');

      expect(await screen.findByText(CHANGED_MESSAGE)).toBeInTheDocument();
      expect(cardIn('New')).toBeInTheDocument();
      await waitFor(() => {
        expect(boardReads.length).toBeGreaterThan(0);
      });
      await waitFor(() => {
        expect(menuIn('New')).toHaveFocus();
      });
    });

    it('should focus the card where the refetch puts it when someone else moved it meanwhile', async () => {
      answerMove(() => problemResponse(409, 'DEAL_CHANGED'));
      const refetch = held();
      const boardReads = recordRequests('get', '/api/deals/board', async () => {
        await refetch.promise;
        return HttpResponse.json(makeBoard([{ ...DEAL, stage: PROPOSAL_STAGE, version: 4 }]));
      });
      const user = userEvent.setup();
      renderBoard();

      await moveFromMenu(user, 'Call');
      // The failed move settles first, so focus taken before the refetch would be lost when the
      // card moves again.
      await waitFor(() => {
        expect(boardReads).toHaveLength(1);
      });
      await flushScheduled();
      refetch.release();

      await waitFor(() => {
        expect(menuIn('Proposal sent')).toHaveFocus();
      });
    });

    it('should focus the page heading when a failed move finds the deal gone', async () => {
      answerMove(() => problemResponse(404, 'DEAL_NOT_FOUND'));
      recordRequests('get', '/api/deals/board', () => HttpResponse.json(makeBoard([])));
      const user = userEvent.setup();
      renderBoard();

      await moveFromMenu(user, 'Call');

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'Deals' })).toHaveFocus();
      });
    });

    it('should send the version of the first answer when the card is moved twice quickly', async () => {
      const answers = [movedTo(CALL_STAGE, 4), movedTo(NEW_STAGE, 5)];
      let current = DEAL;
      const first = held();
      const requests = answerMove(async () => {
        if (requests.length === 1) {
          await first.promise;
        }
        current = answers[requests.length - 1] ?? current;
        return HttpResponse.json(current);
      });
      recordRequests('get', '/api/deals/board', () => HttpResponse.json(makeBoard([current])));
      const user = userEvent.setup();
      renderBoard();

      await moveFromMenu(user, 'Call');
      await moveFromMenu(user, 'New');
      first.release();

      await waitFor(() => {
        expect(requests).toHaveLength(2);
      });
      const bodies = await Promise.all(requests.map((request) => request.json()));
      expect(bodies).toEqual([
        { version: 3, stageId: CALL_STAGE.id, afterId: null },
        { version: 4, stageId: NEW_STAGE.id, afterId: null },
      ]);
    });

    it('should focus the menu button in the new column when the card moves from its menu', async () => {
      answerMove(async () =>
        delay('infinite').then(() => HttpResponse.json(movedTo(CALL_STAGE, 4))),
      );
      const user = userEvent.setup();
      renderBoard();

      await moveFromMenu(user, 'Call');

      await waitFor(() => {
        expect(menuIn('Call')).toHaveFocus();
      });
    });
  });

  describe('dragging', () => {
    async function pressSpaceOnHandle(
      user: ReturnType<typeof userEvent.setup>,
    ): Promise<HTMLElement> {
      const handle = screen.getByRole('button', { name: `Drag ${DEAL.title}` });
      handle.focus();
      await user.keyboard(' ');
      return handle;
    }

    it('should pick a card up from the keyboard when dragging is enabled', async () => {
      const user = userEvent.setup();
      renderBoard();

      const handle = await pressSpaceOnHandle(user);

      await waitFor(() => {
        expect(handle).toHaveAttribute('aria-pressed', 'true');
      });
    });

    it('should keep the pick-up announcement when a card is lifted from the keyboard', async () => {
      const user = userEvent.setup();
      renderBoard();

      const handle = await pressSpaceOnHandle(user);

      expect(handle).toHaveAttribute('aria-pressed', 'true');
      expect(screen.getByText(`Picked up ${DEAL.title} in New.`)).toBeInTheDocument();
    });

    it('should not pick a card up when the board is loading another filter', async () => {
      const user = userEvent.setup();
      renderBoard({ isStale: true });

      const handle = await pressSpaceOnHandle(user);

      expect(handle).not.toHaveAttribute('aria-pressed');
    });

    it('should switch dragging off without a React error when the board turns stale', () => {
      const errors = vi.spyOn(console, 'error');
      onTestFinished(() => {
        errors.mockRestore();
      });
      const { rerender } = renderBoard();

      rerender(<BoardHarness isStale />);

      expect(errors).not.toHaveBeenCalled();
      expect(screen.getByRole('button', { name: `Drag ${DEAL.title}` })).toHaveAttribute(
        'aria-disabled',
        'true',
      );
    });

    it('should highlight a closed column when the dragged card is over a card in it', async () => {
      const won = makeDeal(2, { stage: WON_STAGE, closedAt: '2026-10-08T10:00:00.000Z' });
      layOutBoard();
      renderBoard({ board: makeBoard([DEAL, won]) });
      const handle = screen.getByRole('button', { name: `Drag ${DEAL.title}` });

      fireEvent.pointerDown(handle, pointerInit(0, 0));
      fireEvent.pointerMove(document, pointerInit(0, 10));
      fireEvent.pointerMove(document, pointerInit(COLUMN_STEP_PX * 4, BOARD_TOP_PX));

      await waitFor(() => {
        expect(dropZoneOf('Paid')).toHaveClass('ring-2');
      });
      fireEvent.keyDown(document, { code: 'Escape' });
    });

    it('should disable the card menus when the board is loading another filter', () => {
      renderBoard({ isStale: true });

      expect(screen.getByRole('button', { name: `Actions for ${DEAL.title}` })).toBeDisabled();
    });
  });

  describe('failed moves', () => {
    const OTHER = makeDeal(2, { stage: NEW_STAGE, version: 1 });

    function answerAssigneeGone(): void {
      answerMove(() =>
        problemResponse(400, 'VALIDATION_FAILED', {
          errors: [{ path: 'assigneeId', message: 'Choose a member' }],
        }),
      );
      recordRequests('get', '/api/deals/board', () => HttpResponse.json(BOARD));
    }

    it('should put the card back and offer to edit the deal when its assignee is no longer a member', async () => {
      answerAssigneeGone();
      const user = userEvent.setup();
      renderBoard();

      await moveFromMenu(user, 'Call');
      // A plain click: user-event's focus change hands sonner a relatedTarget jsdom cannot focus.
      fireEvent.click(await screen.findByRole('button', { name: 'Edit deal' }));

      expect(cardIn('New')).toBeInTheDocument();
      expect(mockRouter.push).toHaveBeenCalledWith(`/deals/${DEAL.id}/edit`);
    });

    it('should drop Edit deal from the toast when a later move fails for another reason', async () => {
      answerAssigneeGone();
      const user = userEvent.setup();
      renderBoard();
      await moveFromMenu(user, 'Call');
      await screen.findByRole('button', { name: 'Edit deal' });
      answerMove(() => problemResponse(500, 'INTERNAL_SERVER_ERROR'));

      await moveFromMenu(user, 'Call');

      expect(await screen.findByText('Could not move the deal. Try again.')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Edit deal' })).not.toBeInTheDocument();
    });

    it('should keep the Edit deal toast for 10 seconds when its assignee is no longer a member', async () => {
      const showError = vi.spyOn(toast, 'error');
      onTestFinished(() => {
        showError.mockRestore();
      });
      answerAssigneeGone();
      const user = userEvent.setup();
      renderBoard();

      await moveFromMenu(user, 'Call');

      await waitFor(() => {
        expect(showError).toHaveBeenCalledWith(
          expect.any(String),
          expect.objectContaining({ duration: 10_000 }),
        );
      });
    });

    it('should keep a queued move of another card in place when an earlier move fails', async () => {
      const first = held();
      answerMove(async () => {
        await first.promise;
        return problemResponse(409, 'DEAL_CHANGED');
      });
      recordRequests('post', `/api/deals/${OTHER.id}/move`, async () =>
        delay('infinite').then(() =>
          HttpResponse.json({ ...OTHER, stage: CALL_STAGE, version: 2 }),
        ),
      );
      const user = userEvent.setup();
      renderBoard({ board: makeBoard([DEAL, OTHER]) });

      await moveFromMenu(user, 'Call');
      await moveFromMenu(user, 'Call', OTHER.title);
      first.release();

      expect(await screen.findByText(CHANGED_MESSAGE)).toBeInTheDocument();
      expect(
        within(screen.getByRole('region', { name: 'Call' })).getByRole('link', {
          name: OTHER.title,
        }),
      ).toBeInTheDocument();
      expect(cardIn('New')).toBeInTheDocument();
    });

    it('should put back each failed card when two queued moves fail', async () => {
      const first = held();
      answerMove(async () => {
        await first.promise;
        return problemResponse(409, 'DEAL_CHANGED');
      });
      recordRequests('post', `/api/deals/${OTHER.id}/move`, () =>
        problemResponse(409, 'BOARD_CHANGED'),
      );
      recordRequests('get', '/api/deals/board', async () =>
        delay('infinite').then(() => HttpResponse.json(makeBoard([DEAL, OTHER]))),
      );
      const user = userEvent.setup();
      renderBoard({ board: makeBoard([DEAL, OTHER]) });

      await moveFromMenu(user, 'Call');
      await moveFromMenu(user, 'Call', OTHER.title);
      first.release();

      expect(await screen.findByText('The board changed. Try again.')).toBeInTheDocument();
      const column = within(screen.getByRole('region', { name: 'New' }));
      expect(column.getByRole('link', { name: DEAL.title })).toBeInTheDocument();
      expect(column.getByRole('link', { name: OTHER.title })).toBeInTheDocument();
    });

    it('should show one toast with the last reason when two queued moves fail', async () => {
      const first = held();
      answerMove(async () => {
        await first.promise;
        return problemResponse(409, 'DEAL_CHANGED');
      });
      recordRequests('post', `/api/deals/${OTHER.id}/move`, () =>
        problemResponse(409, 'BOARD_CHANGED'),
      );
      recordRequests('get', '/api/deals/board', () => HttpResponse.json(makeBoard([DEAL, OTHER])));
      const user = userEvent.setup();
      renderBoard({ board: makeBoard([DEAL, OTHER]) });

      await moveFromMenu(user, 'Call');
      await moveFromMenu(user, 'Call', OTHER.title);
      first.release();

      expect(await screen.findByText('The board changed. Try again.')).toBeInTheDocument();
      expect(screen.queryByText(CHANGED_MESSAGE)).not.toBeInTheDocument();
      expect(document.querySelectorAll('[data-sonner-toast]')).toHaveLength(1);
    });

    it('should leave a card where its queued move put it when its earlier move fails', async () => {
      const first = held();
      const requests = answerMove(async () => {
        if (requests.length > 1) {
          return delay('infinite').then(() => HttpResponse.json(movedTo(PROPOSAL_STAGE, 4)));
        }
        await first.promise;
        return problemResponse(409, 'DEAL_CHANGED');
      });
      const user = userEvent.setup();
      renderBoard();

      await moveFromMenu(user, 'Call');
      await moveFromMenu(user, 'Proposal sent');
      first.release();

      expect(await screen.findByText(CHANGED_MESSAGE)).toBeInTheDocument();
      expect(cardIn('Proposal sent')).toBeInTheDocument();
      await waitFor(() => {
        expect(menuIn('Proposal sent')).toHaveFocus();
      });
    });

    it('should leave focus alone when a pointer drag started without focus on the card fails', async () => {
      answerMove(() => problemResponse(409, 'DEAL_CHANGED'));
      recordRequests('get', '/api/deals/board', () => HttpResponse.json(BOARD));
      layOutBoard();
      const { queryClient } = renderBoard();

      await dragToCall();

      expect(await screen.findByText(CHANGED_MESSAGE)).toBeInTheDocument();
      await waitFor(() => {
        expect(queryClient.isMutating()).toBe(0);
      });
      await flushScheduled();
      expect(cardIn('New')).toBeInTheDocument();
      expect(document.body).toHaveFocus();
    });

    it('should leave focus alone when a move fails while another card is dragged', async () => {
      const first = held();
      answerMove(async () => {
        await first.promise;
        return problemResponse(409, 'DEAL_CHANGED');
      });
      recordRequests('get', '/api/deals/board', () => HttpResponse.json(makeBoard([DEAL, OTHER])));
      layOutBoard();
      const { queryClient } = renderBoard({ board: makeBoard([DEAL, OTHER]) });
      const user = userEvent.setup();
      await moveFromMenu(user, 'Call');
      act(() => {
        if (document.activeElement instanceof HTMLElement) {
          document.activeElement.blur();
        }
      });
      fireEvent.pointerDown(
        screen.getByRole('button', { name: `Drag ${OTHER.title}` }),
        pointerInit(0, BOARD_TOP_PX),
      );
      fireEvent.pointerMove(document, pointerInit(0, BOARD_TOP_PX + 10));
      expect(await screen.findByText(`Picked up ${OTHER.title} in New.`)).toBeInTheDocument();

      first.release();

      expect(await screen.findByText(CHANGED_MESSAGE)).toBeInTheDocument();
      await waitFor(() => {
        expect(queryClient.isMutating()).toBe(0);
      });
      await flushScheduled();
      expect(document.body).toHaveFocus();
      fireEvent.keyDown(document, { code: 'Escape' });
    });

    it('should return focus to the handle without scrolling when a pointer drag from it fails', async () => {
      answerMove(() => problemResponse(409, 'DEAL_CHANGED'));
      recordRequests('get', '/api/deals/board', () => HttpResponse.json(BOARD));
      layOutBoard();
      const focus = vi.spyOn(HTMLElement.prototype, 'focus');
      onTestFinished(() => {
        focus.mockRestore();
      });
      renderBoard();
      handleIn('New').focus();

      await dragToCall();

      await waitFor(() => {
        expect(handleIn('New')).toHaveFocus();
      });
      expect(focus).toHaveBeenLastCalledWith({ preventScroll: true });
    });
  });

  describe('refetches', () => {
    const OTHER = makeDeal(2, { stage: NEW_STAGE, version: 1 });

    it('should refetch the board only after the last move settles when two moves are queued', async () => {
      const first = held();
      const second = held();
      answerMove(async () => {
        await first.promise;
        return HttpResponse.json(movedTo(CALL_STAGE, 4));
      });
      const otherMoves = recordRequests('post', `/api/deals/${OTHER.id}/move`, async () => {
        await second.promise;
        return HttpResponse.json({ ...OTHER, stage: CALL_STAGE, version: 2 });
      });
      const boardReads = recordRequests('get', '/api/deals/board', () => HttpResponse.json(BOARD));
      const user = userEvent.setup();
      renderBoard({ board: makeBoard([DEAL, OTHER]) });

      await moveFromMenu(user, 'Call');
      await moveFromMenu(user, 'Call', OTHER.title);
      first.release();
      // The scope starts the second move only once the first one's onSettled has finished.
      await waitFor(() => {
        expect(otherMoves).toHaveLength(1);
      });
      expect(boardReads).toHaveLength(0);
      second.release();

      await waitFor(() => {
        expect(boardReads).toHaveLength(1);
      });
    });

    it('should not refetch a stale board when the window regains focus during a move', async () => {
      answerMove(async () =>
        delay('infinite').then(() => HttpResponse.json(movedTo(CALL_STAGE, 4))),
      );
      const boardReads = recordRequests('get', '/api/deals/board', () => HttpResponse.json(BOARD));
      const user = userEvent.setup();
      const { queryClient } = renderBoard();
      const probeFetches = startRefetchProbe(queryClient);

      await moveFromMenu(user, 'Call');
      await queryClient.invalidateQueries({ queryKey: dealKeys.boards, refetchType: 'none' });
      const fetchesBefore = probeFetches();
      focusManager.setFocused(false);
      focusManager.setFocused(true);
      focusManager.setFocused(undefined);

      await waitFor(() => {
        expect(probeFetches()).toBeGreaterThan(fetchesBefore);
      });
      expect(queryClient.isFetching({ queryKey: dealKeys.boards })).toBe(0);
      expect(boardReads).toHaveLength(0);
      expect(cardIn('Call')).toBeInTheDocument();
    });

    it('should not refetch a stale board when the network comes back during a move', async () => {
      answerMove(async () =>
        delay('infinite').then(() => HttpResponse.json(movedTo(CALL_STAGE, 4))),
      );
      const boardReads = recordRequests('get', '/api/deals/board', () => HttpResponse.json(BOARD));
      const user = userEvent.setup();
      const { queryClient } = renderBoard();
      const probeFetches = startRefetchProbe(queryClient);

      await moveFromMenu(user, 'Call');
      await queryClient.invalidateQueries({ queryKey: dealKeys.boards, refetchType: 'none' });
      const fetchesBefore = probeFetches();
      onlineManager.setOnline(false);
      onlineManager.setOnline(true);

      await waitFor(() => {
        expect(probeFetches()).toBeGreaterThan(fetchesBefore);
      });
      expect(queryClient.isFetching({ queryKey: dealKeys.boards })).toBe(0);
      expect(boardReads).toHaveLength(0);
      expect(cardIn('Call')).toBeInTheDocument();
    });
  });
});
