import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';

import { createQueryClient } from '@/shared/api/query-client';
import type { MemberFilter } from '@clientry/shared/workspaces';

import { MemberFilterMenu } from './member-filter-menu';
import { TEST_MEMBERS } from '../../../../test/deals';
import { TEST_SESSION } from '../../../../test/fixtures';
import { problemResponse } from '../../../../test/msw/problem';
import { recordRequests } from '../../../../test/msw/record';
import { renderWithProviders } from '../../../../test/render';
import { memberKeys } from '../model/member-keys';

const MAX = {
  id: '0199a3c4-6a7b-7c8d-9e0f-1a2b3c4d5e6f',
  name: 'Max Kim',
  email: 'max@example.com',
  role: 'manager',
  joinedAt: '2026-10-02T09:00:00.000Z',
} as const;
const TEAM = { items: [...TEST_MEMBERS.items, MAX] };
const FORMER_ID = '0199a3c4-0000-7000-8000-000000000000';
const ME = TEST_SESSION.user.id;

function renderMenu(
  value: MemberFilter | null,
  queryClient = createQueryClient(),
): { readonly onChange: ReturnType<typeof vi.fn> } {
  const onChange = vi.fn();
  renderWithProviders(
    <MemberFilterMenu label="Assignee" value={value} currentUserId={ME} onChange={onChange} />,
    queryClient,
  );
  return { onChange };
}

function withTeam(): ReturnType<typeof createQueryClient> {
  const queryClient = createQueryClient();
  queryClient.setQueryData(memberKeys.list, TEAM);
  return queryClient;
}

describe('MemberFilterMenu', () => {
  it('should load the members once when the menu first opens and list Anyone, Me and the others', async () => {
    const requests = recordRequests('get', '/api/members', () => HttpResponse.json(TEAM));
    const user = userEvent.setup();
    const queryClient = createQueryClient();
    renderMenu(null, queryClient);
    // MSW records a request later, so the cache tells whether one was started on mount.
    expect(queryClient.isFetching({ queryKey: memberKeys.list })).toBe(0);

    await user.click(screen.getByRole('button', { name: 'Assignee: Anyone' }));

    const items = await screen.findAllByRole('menuitemradio');
    await waitFor(() => {
      expect(screen.getAllByRole('menuitemradio').map((item) => item.textContent)).toEqual([
        'Anyone',
        'Me',
        'Max Kim',
      ]);
    });
    expect(items[0]).toHaveAttribute('aria-checked', 'true');
    expect(requests).toHaveLength(1);
  });

  it('should check Former member when the id is not a current member', async () => {
    const user = userEvent.setup();
    renderMenu(FORMER_ID, withTeam());

    expect(screen.getByRole('button', { name: 'Assignee: Former member' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Assignee: Former member' }));

    expect(await screen.findByRole('menuitemradio', { name: 'Former member' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
  });

  it('should check Me when the id is the caller', async () => {
    const user = userEvent.setup();
    renderMenu(ME, withTeam());

    await user.click(screen.getByRole('button', { name: 'Assignee: Me' }));

    expect(await screen.findByRole('menuitemradio', { name: 'Me' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
  });

  it('should show the label alone when the members are not loaded', () => {
    renderMenu(MAX.id);

    expect(screen.getByRole('button', { name: 'Assignee' })).toBeInTheDocument();
  });

  it('should name the member on the trigger when the members are loaded', () => {
    renderMenu(MAX.id, withTeam());

    expect(screen.getByRole('button', { name: 'Assignee: Max Kim' })).toBeInTheDocument();
  });

  it('should report the choice and return focus to the trigger when an item is chosen', async () => {
    const user = userEvent.setup();
    const { onChange } = renderMenu(null, withTeam());
    const trigger = screen.getByRole('button', { name: 'Assignee: Anyone' });

    await user.click(trigger);
    await user.click(await screen.findByRole('menuitemradio', { name: 'Max Kim' }));

    expect(onChange).toHaveBeenCalledWith(MAX.id);
    await waitFor(() => {
      expect(trigger).toHaveFocus();
    });
  });

  it('should offer Try again when the members fail to load', async () => {
    // A 4xx: the client retries server errors before it shows one.
    recordRequests('get', '/api/members', () => problemResponse(403, 'FORBIDDEN'));
    const user = userEvent.setup();
    renderMenu(null);

    await user.click(screen.getByRole('button', { name: 'Assignee: Anyone' }));

    expect(await screen.findByText('Could not load members')).toBeInTheDocument();
    expect(screen.getByTestId('members-notice')).toHaveAttribute('aria-live', 'polite');
    expect(screen.getByTestId('members-notice')).toHaveTextContent('Could not load members');
    expect(screen.getByRole('menuitem', { name: 'Try again' })).toBeInTheDocument();
    expect(screen.getByRole('menuitemradio', { name: 'Me' })).toBeInTheDocument();
  });
});
