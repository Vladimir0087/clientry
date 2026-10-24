import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';

import { sessionKeys } from '@/entities/session';
import { createQueryClient } from '@/shared/api/query-client';
import type { QueryClientOptions } from '@/shared/api/query-client';
import { replaceLocation } from '@/shared/lib/navigation';

import { UserMenu } from './user-menu';
import { TEST_SESSION } from '../../../../test/fixtures';
import { recordRequests } from '../../../../test/msw/record';
import { renderWithProviders } from '../../../../test/render';

function renderSignedIn(options: QueryClientOptions = {}): void {
  const queryClient = createQueryClient(options);
  queryClient.setQueryData(sessionKeys.current, TEST_SESSION);
  renderWithProviders(<UserMenu />, queryClient);
}

async function openMenu(): Promise<void> {
  await userEvent.click(await screen.findByRole('button', { name: 'Account' }));
}

describe('UserMenu', () => {
  it('should show an icon instead of the initials when signed in', async () => {
    renderSignedIn();

    const button = await screen.findByRole('button', { name: 'Account' });

    expect(button.textContent).toBe('');
    expect(button.querySelector('svg')).not.toBeNull();
  });

  it('should show the name, email and role when opened', async () => {
    renderSignedIn();

    await openMenu();

    const menu = await screen.findByRole('menu');
    expect(menu).toHaveTextContent('Ann Lee');
    expect(menu).toHaveTextContent('ann@example.com');
    expect(menu).toHaveTextContent('Owner');
  });

  it('should log out once and replace the page with /login when Log out is chosen', async () => {
    const logouts = recordRequests(
      'post',
      '/api/auth/logout',
      () => new HttpResponse(null, { status: 204 }),
    );
    renderSignedIn();
    await openMenu();

    await userEvent.click(await screen.findByRole('menuitem', { name: 'Log out' }));

    await waitFor(() => {
      expect(replaceLocation).toHaveBeenCalledWith('/login');
    });
    expect(logouts).toHaveLength(1);
  });

  it('should skip the mutation-success hook when Log out succeeds', async () => {
    recordRequests('post', '/api/auth/logout', () => new HttpResponse(null, { status: 204 }));
    const onMutationSuccess = vi.fn();
    renderSignedIn({ onMutationSuccess });
    await openMenu();

    await userEvent.click(await screen.findByRole('menuitem', { name: 'Log out' }));

    await waitFor(() => {
      expect(replaceLocation).toHaveBeenCalledWith('/login');
    });
    expect(onMutationSuccess).not.toHaveBeenCalled();
  });

  it('should toast and stay when the logout fails', async () => {
    recordRequests('post', '/api/auth/logout', () => HttpResponse.error());
    renderSignedIn();
    await openMenu();

    await userEvent.click(await screen.findByRole('menuitem', { name: 'Log out' }));

    expect(await screen.findByText('Could not log out. Try again.')).toBeInTheDocument();
    expect(replaceLocation).not.toHaveBeenCalled();
  });
});
