import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse } from 'msw';
import { useRef } from 'react';
import type * as React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useClientList } from '@/entities/client';

import { ClientFiltersToolbar } from './client-filters-toolbar';
import { SEARCH_DELAY_MS } from './search-field';
import { TEST_CLIENT_LIST } from '../../../../test/clients';
import { TEST_MEMBERS } from '../../../../test/deals';
import { recordRequests } from '../../../../test/msw/record';
import { renderWithUrl } from '../../../../test/render';
import { useClientFilters } from '../model/use-client-filters';

const MAX = {
  id: '0199a3c4-6a7b-7c8d-9e0f-1a2b3c4d5e6f',
  name: 'Max Kim',
  email: 'max@example.com',
  role: 'manager',
  joinedAt: '2026-10-02T09:00:00.000Z',
} as const;

function FilteredList(): React.JSX.Element {
  const state = useClientFilters();
  const searchRef = useRef<HTMLInputElement>(null);
  useClientList(state.filters);
  const handleClear = (): void => {
    state.clearFilters();
    searchRef.current?.focus();
  };
  return <ClientFiltersToolbar state={state} searchRef={searchRef} onClear={handleClear} />;
}

function searchInput(): HTMLElement {
  return screen.getByRole('searchbox', { name: 'Search clients' });
}

describe('ClientFiltersToolbar', () => {
  let listRequests: Request[];

  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    listRequests = recordRequests('get', '/api/clients', () => HttpResponse.json(TEST_CLIENT_LIST));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function setup(): ReturnType<typeof userEvent.setup> {
    return userEvent.setup({ advanceTimers: vi.advanceTimersByTime.bind(vi) });
  }

  it('should fill the controls from the URL when the page opens with filters', () => {
    renderWithUrl(
      <FilteredList />,
      '?q=acme&source=website,telegram&tags=vip&createdBy=me&sort=name_asc',
    );

    expect(searchInput()).toHaveValue('acme');
    expect(screen.getByRole('button', { name: /^Source/ })).toHaveTextContent('2');
    expect(screen.getByRole('button', { name: /^Tags/ })).toHaveTextContent('1');
    expect(screen.getByRole('button', { name: 'Added by: Me' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sort: Name A–Z' })).toBeInTheDocument();
  });

  it('should write createdBy and send it with the list when a member is chosen', async () => {
    recordRequests('get', '/api/members', () =>
      HttpResponse.json({ items: [...TEST_MEMBERS.items, MAX] }),
    );
    const user = setup();
    const { urlUpdates } = renderWithUrl(<FilteredList />);

    await user.click(screen.getByRole('button', { name: 'Added by: Anyone' }));
    await user.click(await screen.findByRole('menuitemradio', { name: MAX.name }));

    await waitFor(() => {
      expect(urlUpdates.at(-1)?.queryString).toBe(`?createdBy=${MAX.id}`);
    });
    await waitFor(() => {
      expect(new URL(listRequests.at(-1)?.url ?? '').searchParams.get('createdBy')).toBe(MAX.id);
    });
    expect(screen.getByRole('button', { name: `Added by: ${MAX.name}` })).toHaveFocus();
  });

  it.each(['?createdBy=abc', '?mine=true'])(
    'should filter nothing when the URL has %s',
    async (search) => {
      renderWithUrl(<FilteredList />, search);

      expect(screen.getByRole('button', { name: 'Added by: Anyone' })).toBeInTheDocument();
      await waitFor(() => {
        expect(listRequests).toHaveLength(1);
      });
      expect(new URL(listRequests[0]?.url ?? '').searchParams.has('createdBy')).toBe(false);
    },
  );

  it('should write q once after the pause and send one list request when the user types', async () => {
    const user = setup();
    const { urlUpdates } = renderWithUrl(<FilteredList />);
    await waitFor(() => {
      expect(listRequests).toHaveLength(1);
    });

    await user.type(searchInput(), 'rom');
    expect(urlUpdates).toHaveLength(0);
    await act(() => vi.advanceTimersByTimeAsync(SEARCH_DELAY_MS));

    await waitFor(() => {
      expect(listRequests).toHaveLength(2);
    });
    expect(urlUpdates.map(({ queryString }) => queryString)).toEqual(['?q=rom']);
    expect(new URL(listRequests[1]?.url ?? '').searchParams.get('q')).toBe('rom');
  });

  it('should write q at once when Enter is pressed', async () => {
    const user = setup();
    const { urlUpdates } = renderWithUrl(<FilteredList />);

    await user.type(searchInput(), 'rom{Enter}');

    await waitFor(() => {
      expect(urlUpdates.at(-1)?.searchParams.get('q')).toBe('rom');
    });
  });

  it('should drop q at once when the search is cleared', async () => {
    const user = setup();
    const { urlUpdates } = renderWithUrl(<FilteredList />, '?q=rom');

    await user.clear(searchInput());

    await waitFor(() => {
      expect(urlUpdates.at(-1)?.searchParams.has('q')).toBe(false);
    });
  });

  it('should put the older search into the input when Back restores it', async () => {
    const { navigate } = renderWithUrl(<FilteredList />, '?q=new');

    navigate('?q=old');

    await waitFor(() => {
      expect(searchInput()).toHaveValue('old');
    });
  });

  it('should write the sources comma-separated when two are picked', async () => {
    const user = setup();
    const { urlUpdates } = renderWithUrl(<FilteredList />);

    await user.click(screen.getByRole('button', { name: /^Source/ }));
    await user.click(await screen.findByRole('menuitemcheckbox', { name: 'Website' }));
    await user.click(screen.getByRole('menuitemcheckbox', { name: 'Telegram' }));

    await waitFor(() => {
      expect(urlUpdates.at(-1)?.searchParams.get('source')).toBe('telegram,website');
    });
  });

  it('should keep the sort and replace history when the filters are cleared', async () => {
    const user = setup();
    const { urlUpdates } = renderWithUrl(<FilteredList />, '?q=a&createdBy=me&sort=oldest');

    await user.click(screen.getByRole('button', { name: 'Clear filters' }));

    await waitFor(() => {
      expect(urlUpdates.at(-1)?.queryString).toBe('?sort=oldest');
    });
    expect(searchInput()).toHaveFocus();
  });

  it('should drop a pending search when the filters are cleared before the pause ends', async () => {
    const user = setup();
    const { urlUpdates } = renderWithUrl(<FilteredList />, '?q=x');

    await user.type(searchInput(), 'y');
    await user.click(screen.getByRole('button', { name: 'Clear filters' }));
    await act(() => vi.advanceTimersByTimeAsync(SEARCH_DELAY_MS));

    expect(urlUpdates.map(({ queryString }) => queryString)).toEqual(['']);
    expect(searchInput()).toHaveValue('');
  });

  it('should replace history and stay shallow when every kind of filter changes', async () => {
    const user = setup();
    const { urlUpdates } = renderWithUrl(<FilteredList />);

    await user.type(searchInput(), 'rom{Enter}');
    await user.click(screen.getByRole('button', { name: 'Added by: Anyone' }));
    await user.click(await screen.findByRole('menuitemradio', { name: 'Me' }));
    await user.click(screen.getByRole('button', { name: /^Source/ }));
    await user.click(await screen.findByRole('menuitemcheckbox', { name: 'Website' }));
    await user.keyboard('{Escape}');
    await user.click(screen.getByRole('button', { name: /^Sort/ }));
    await user.click(await screen.findByRole('menuitemradio', { name: 'Name A–Z' }));

    await waitFor(() => {
      expect(urlUpdates.at(-1)?.queryString).toBe(
        '?q=rom&createdBy=me&source=website&sort=name_asc',
      );
    });
    expect(urlUpdates.every(({ options }) => options.history === 'replace')).toBe(true);
    expect(urlUpdates.every(({ options }) => options.shallow)).toBe(true);
  });
});
