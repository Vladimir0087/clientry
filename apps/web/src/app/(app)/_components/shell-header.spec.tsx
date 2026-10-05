import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { delay, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';

import { ShellHeader } from './shell-header';
import { TEST_SESSION } from '../../../../test/fixtures';
import { recordRequests } from '../../../../test/msw/record';
import { renderWithProviders } from '../../../../test/render';

describe('ShellHeader', () => {
  it('should show skeletons for the workspace and the menu when the session is loading', () => {
    recordRequests('get', '/api/auth/me', async () => {
      await delay('infinite');
      return HttpResponse.json(TEST_SESSION);
    });

    renderWithProviders(<ShellHeader />);

    expect(screen.getByTestId('workspace-skeleton')).toBeInTheDocument();
    expect(screen.getByTestId('user-menu-skeleton')).toBeInTheDocument();
  });

  it('should show the workspace name when the session loads', async () => {
    renderWithProviders(<ShellHeader />);

    expect(await screen.findByText('Acme Studio')).toBeInTheDocument();
  });

  it('should leave out the workspace and offer only Log out when the session fails', async () => {
    recordRequests('get', '/api/auth/me', () => HttpResponse.json({ user: null }));
    renderWithProviders(<ShellHeader />);

    await userEvent.click(await screen.findByRole('button', { name: 'Account' }));

    const items = await screen.findAllByRole('menuitem');
    expect(items.map((item) => item.textContent)).toEqual(['Log out']);
    expect(screen.queryByText('Acme Studio')).not.toBeInTheDocument();
    expect(screen.queryByTestId('workspace-skeleton')).not.toBeInTheDocument();
  });
});
