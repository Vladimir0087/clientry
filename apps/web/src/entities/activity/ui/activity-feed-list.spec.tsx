import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import type { Route } from 'next';
import type * as React from 'react';
import { describe, expect, it } from 'vitest';

import type { ActivityEntry } from '@clientry/shared/activity';

import { ActivityFeedList } from './activity-feed-list';
import type { SubjectHref } from './activity-feed-list';
import { makeActivityEntry, makeActivityPage } from '../../../../test/activity';
import { problemResponse } from '../../../../test/msw/problem';
import { server } from '../../../../test/msw/server';
import { renderWithProviders } from '../../../../test/render';
import { useActivityFeed } from '../model/use-activity-feed';

const MAX = { id: '0199a3c4-6a7b-7c8d-9e0f-1a2b3c4d5e6f', name: 'Max' };
const ANN_ID = '0b6f2a8e-4c1d-4e7a-9f3b-2d5c8e1a7b40';
const STAGE = (name: string, kind: 'open' | 'won' | 'lost' = 'open') => ({
  id: '0199a3c4-6f70-7a81-9b2c-3d4e5f6a7b8c',
  name,
  kind,
});

const subjectHref: SubjectHref = (subject) => `/${subject.kind}s/${subject.id}` as Route;

function Feed(): React.JSX.Element | null {
  const feed = useActivityFeed();
  return feed.data === undefined ? null : (
    <ActivityFeedList feed={feed} data={feed.data} subjectHref={subjectHref} />
  );
}

function serveFeed(...pages: readonly (readonly ActivityEntry[])[]): void {
  server.use(
    http.get('*/api/activity', ({ request }) => {
      const cursor = new URL(request.url).searchParams.get('cursor');
      const index = cursor === null ? 0 : Number(cursor);
      const items = pages[index] ?? [];
      const next = index + 1 < pages.length ? String(index + 1) : null;
      return HttpResponse.json(makeActivityPage(items, next));
    }),
  );
}

async function sentences(): Promise<string[]> {
  const list = await screen.findByRole('list');
  return within(list)
    .getAllByRole('listitem')
    .flatMap((item) => [...item.querySelectorAll('p')].map((paragraph) => paragraph.textContent));
}

describe('ActivityFeedList', () => {
  it('should write one sentence per line for every entry type when the feed has them', async () => {
    serveFeed([
      makeActivityEntry(1, {
        type: 'deal_created',
        payload: { stage: STAGE('New'), amount: 150_000, currency: 'USD' },
      }),
      makeActivityEntry(2, {
        type: 'deal_moved',
        payload: { from: STAGE('Contract'), to: STAGE('Paid', 'won') },
      }),
      makeActivityEntry(3, {
        type: 'deal_moved',
        payload: { from: STAGE('Contract'), to: STAGE('Lost', 'lost'), reason: 'stage_deleted' },
      }),
      makeActivityEntry(4, {
        type: 'deal_updated',
        payload: {
          changes: [
            { field: 'title', from: 'Old', to: 'New' },
            {
              field: 'amount',
              from: { amount: 100_000, currency: 'USD' },
              to: { amount: 150_000, currency: 'USD' },
            },
            { field: 'client', from: { id: MAX.id, name: 'A' }, to: { id: MAX.id, name: 'B' } },
            { field: 'assignee', from: { id: ANN_ID, name: 'Ann' }, to: MAX },
          ],
        },
      }),
      makeActivityEntry(5, { type: 'deal_deleted', payload: {} }),
      makeActivityEntry(6, { type: 'deal_restored', payload: {} }),
      makeActivityEntry(7, { type: 'client_created', payload: {} }),
      makeActivityEntry(8, {
        type: 'task_created',
        payload: { assignee: MAX, dueAt: '2026-10-15T12:00:00.000Z' },
      }),
      makeActivityEntry(9, {
        type: 'task_created',
        payload: { assignee: { id: ANN_ID, name: 'Ann' }, dueAt: '2026-10-15T12:00:00.000Z' },
      }),
      makeActivityEntry(10, { type: 'task_completed', payload: {}, actor: MAX }),
    ]);

    renderWithProviders(<Feed />);

    const lines = await sentences();
    expect(lines.slice(0, 11)).toEqual([
      'Ann created the deal Subject 1 in New · $1,500',
      'Ann moved Subject 2 from Contract to PaidWon',
      'Ann moved Subject 3 from Contract to Lost when Contract was deletedLost',
      'Ann renamed Subject 4 from “Old” to “New”',
      'Ann changed the amount of Subject 4 from $1,000 to $1,500',
      'Ann changed the client of Subject 4 from A to B',
      'Ann changed the assignee of Subject 4 from Ann to Max',
      'Ann deleted the deal Subject 5',
      'Ann restored the deal Subject 6',
      'Ann added the client Subject 7',
      expect.stringMatching(/^Ann created the task Subject 8 for Max · due .+/),
    ]);
    expect(lines.slice(11)).toEqual([
      expect.stringMatching(/^Ann created the task Subject 9 · due .+/),
      'Max completed the task Subject 10',
    ]);
  });

  it('should link the subject only when its page would open', async () => {
    const available = makeActivityEntry(1);
    const deleted = makeActivityEntry(2, {
      subject: { kind: 'deal', id: MAX.id, label: 'Gone deal', isAvailable: false },
    });
    serveFeed([available, deleted]);

    renderWithProviders(<Feed />);

    expect(await screen.findByRole('link', { name: 'Subject 1' })).toHaveAttribute(
      'href',
      `/deals/${available.subject.id}`,
    );
    expect(screen.getByText('Gone deal')).not.toHaveAttribute('href');
    expect(screen.queryByRole('link', { name: 'Gone deal' })).not.toBeInTheDocument();
  });

  it('should show the empty message when the feed has no entries', async () => {
    serveFeed([]);

    renderWithProviders(<Feed />);

    expect(
      await screen.findByText('No activity yet. New deals, clients and tasks show up here.'),
    ).toBeInTheDocument();
  });

  it('should append older entries and keep focus on Show older when another page follows', async () => {
    const user = userEvent.setup();
    serveFeed([makeActivityEntry(30)], [makeActivityEntry(20)], [makeActivityEntry(10)]);
    renderWithProviders(<Feed />);
    const button = await screen.findByRole('button', { name: 'Show older' });

    await user.click(button);

    expect(await screen.findByText('Subject 20')).toBeInTheDocument();
    expect(screen.getByText('Subject 30')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Show older' })).toHaveFocus();
  });

  it('should toast and keep the button when an older page fails', async () => {
    const user = userEvent.setup();
    server.use(
      http.get('*/api/activity', ({ request }) =>
        new URL(request.url).searchParams.has('cursor')
          ? problemResponse(400, 'VALIDATION_FAILED')
          : HttpResponse.json(makeActivityPage([makeActivityEntry(1)], 'next')),
      ),
    );
    renderWithProviders(<Feed />);

    await user.click(await screen.findByRole('button', { name: 'Show older' }));

    expect(await screen.findByText('Could not load older activity.')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Show older' })).toBeInTheDocument();
    });
    expect(screen.getByText('Subject 1')).toBeInTheDocument();
  });
});
