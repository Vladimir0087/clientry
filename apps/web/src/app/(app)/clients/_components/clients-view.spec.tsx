import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { delay, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';

import { ClientsView } from './clients-view';
import { clientPage, makeClient } from '../../../../../test/clients';
import { failOnceThenWait } from '../../../../../test/msw/fail-once';
import { problemResponse } from '../../../../../test/msw/problem';
import { recordRequests } from '../../../../../test/msw/record';
import type { Resolver } from '../../../../../test/msw/record';
import { renderWithUrl } from '../../../../../test/render';

const FIRST_PAGE = [makeClient(1), makeClient(2)];
const SECOND_PAGE = [makeClient(3), makeClient(4)];
const THIRD_PAGE = [makeClient(5)];

function answerList(resolver: Resolver): Request[] {
  return recordRequests('get', '/api/clients', resolver);
}

function cursorOf(request: Request | undefined): string | null {
  return new URL(request?.url ?? 'http://x').searchParams.get('cursor');
}

// Answers by cursor: first page, then c2, then c3 with no further page.
function pagedList(): Resolver {
  return ({ request }) => {
    const cursor = new URL(request.url).searchParams.get('cursor');
    if (cursor === null) {
      return HttpResponse.json(clientPage(FIRST_PAGE, 'c2'));
    }
    if (cursor === 'c2') {
      return HttpResponse.json(clientPage(SECOND_PAGE, 'c3'));
    }
    return HttpResponse.json(clientPage(THIRD_PAGE));
  };
}

function tableNames(): string[] {
  const table = screen.getByRole('table');
  return within(table)
    .getAllByRole('link')
    .map((link) => link.textContent);
}

describe('ClientsView', () => {
  it('should show skeleton rows when the list is loading', () => {
    answerList(async () => {
      await delay('infinite');
      return HttpResponse.json(clientPage([]));
    });

    renderWithUrl(<ClientsView />);

    expect(screen.getByTestId('client-list-skeleton')).toBeInTheDocument();
  });

  it('should list the clients with links to their cards when the list loads', async () => {
    answerList(() => HttpResponse.json(clientPage(FIRST_PAGE)));

    renderWithUrl(<ClientsView />);

    expect(await screen.findByRole('table')).toBeInTheDocument();
    expect(tableNames()).toEqual(['Client 1', 'Client 2']);
    expect(
      within(screen.getByRole('table')).getByRole('link', { name: 'Client 1' }),
    ).toHaveAttribute('href', `/clients/${FIRST_PAGE[0]?.id ?? ''}`);
  });

  it('should invite to add a client when the workspace has none', async () => {
    answerList(() => HttpResponse.json(clientPage([])));

    renderWithUrl(<ClientsView />);

    expect(await screen.findByText('No clients yet')).toBeInTheDocument();
    expect(screen.getByText('Add the people and companies you work with.')).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'New client' })).toHaveLength(2);
  });

  it('should offer to clear the filters when nothing matches them', async () => {
    answerList(() => HttpResponse.json(clientPage([])));
    const { urlUpdates } = renderWithUrl(<ClientsView />, '?q=zzz');

    await screen.findByText('No clients match your filters');
    const buttons = screen.getAllByRole('button', { name: 'Clear filters' });
    await userEvent.click(buttons.at(-1) ?? document.body);

    await waitFor(() => {
      expect(urlUpdates.at(-1)?.searchParams.has('q')).toBe(false);
    });
  });

  it('should refetch when Try again is pressed after the list failed', async () => {
    let attempt = 0;
    const requests = answerList(() => {
      attempt += 1;
      return attempt === 1
        ? HttpResponse.json({ items: null })
        : HttpResponse.json(clientPage(FIRST_PAGE));
    });
    renderWithUrl(<ClientsView />);

    await userEvent.click(await screen.findByRole('button', { name: 'Try again' }));

    expect(await screen.findByRole('table')).toBeInTheDocument();
    expect(requests).toHaveLength(2);
  });

  it('should focus the Clients heading when Try again reloads the list', async () => {
    answerList(failOnceThenWait(clientPage(FIRST_PAGE)));
    renderWithUrl(<ClientsView />);

    await userEvent.click(await screen.findByRole('button', { name: 'Try again' }));

    expect(await screen.findByTestId('client-list-skeleton')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Clients' })).toHaveFocus();
  });

  it('should append the next page and keep focus on Load more when more pages remain', async () => {
    const requests = answerList(pagedList());
    renderWithUrl(<ClientsView />);
    const loadMore = await screen.findByRole('button', { name: 'Load more' });

    await userEvent.click(loadMore);

    await waitFor(() => {
      expect(tableNames()).toEqual(['Client 1', 'Client 2', 'Client 3', 'Client 4']);
    });
    expect(cursorOf(requests[1])).toBe('c2');
    expect(screen.getByRole('button', { name: 'Load more' })).toHaveFocus();
  });

  it('should move focus to the first new row when the last page arrives', async () => {
    answerList(pagedList());
    renderWithUrl(<ClientsView />);
    await userEvent.click(await screen.findByRole('button', { name: 'Load more' }));
    await waitFor(() => {
      expect(tableNames()).toHaveLength(4);
    });

    await userEvent.click(screen.getByRole('button', { name: 'Load more' }));

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Load more' })).not.toBeInTheDocument();
    });
    expect(within(screen.getByRole('table')).getByRole('link', { name: 'Client 5' })).toHaveFocus();
  });

  it('should offer a retry when the next page fails', async () => {
    let isBroken = true;
    const requests = answerList((info) => {
      if (new URL(info.request.url).searchParams.has('cursor') && isBroken) {
        isBroken = false;
        return problemResponse(400, 'VALIDATION_FAILED');
      }
      return pagedList()(info);
    });
    renderWithUrl(<ClientsView />);
    await userEvent.click(await screen.findByRole('button', { name: 'Load more' }));

    expect(await screen.findByText('Could not load more')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));

    await waitFor(() => {
      expect(tableNames()).toHaveLength(4);
    });
    expect(requests.filter((request) => cursorOf(request) === 'c2')).toHaveLength(2);
  });

  it('should keep the old rows marked busy when new filters are loading', async () => {
    answerList(async ({ request }) => {
      if (new URL(request.url).searchParams.has('q')) {
        await delay('infinite');
      }
      return HttpResponse.json(clientPage(FIRST_PAGE));
    });
    const { navigate } = renderWithUrl(<ClientsView />);
    await screen.findByRole('table');

    navigate('?q=new');

    await waitFor(() => {
      expect(screen.getByRole('table').closest('[aria-busy]')).toHaveAttribute('aria-busy', 'true');
    });
    expect(tableNames()).toEqual(['Client 1', 'Client 2']);
  });

  it('should announce how many clients are shown when a page loads', async () => {
    answerList(pagedList());
    renderWithUrl(<ClientsView />);

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent('2 clients shown');
    });
    await userEvent.click(screen.getByRole('button', { name: 'Load more' }));

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent('4 clients shown');
    });
  });
});
