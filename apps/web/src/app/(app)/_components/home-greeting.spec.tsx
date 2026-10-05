import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { delay, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';

import { HomeGreeting } from './home-greeting';
import { TEST_SESSION } from '../../../../test/fixtures';
import { recordRequests } from '../../../../test/msw/record';
import { renderWithProviders } from '../../../../test/render';

describe('HomeGreeting', () => {
  it('should show a skeleton when the session is loading', () => {
    recordRequests('get', '/api/auth/me', async () => {
      await delay('infinite');
      return HttpResponse.json(TEST_SESSION);
    });

    renderWithProviders(<HomeGreeting />);

    expect(screen.getByTestId('greeting-skeleton')).toBeInTheDocument();
  });

  it('should greet the user with the workspace and role when the session loads', async () => {
    renderWithProviders(<HomeGreeting />);

    expect(await screen.findByRole('heading', { name: 'Welcome, Ann Lee' })).toBeInTheDocument();
    expect(screen.getByText('Acme Studio · Owner')).toBeInTheDocument();
  });

  it('should refetch the session when Try again is clicked after an error', async () => {
    let isBroken = true;
    const requests = recordRequests('get', '/api/auth/me', () =>
      isBroken ? HttpResponse.json({ user: null }) : HttpResponse.json(TEST_SESSION),
    );
    renderWithProviders(<HomeGreeting />);
    const retry = await screen.findByRole('button', { name: 'Try again' });
    isBroken = false;

    await userEvent.click(retry);

    expect(await screen.findByRole('heading', { name: 'Welcome, Ann Lee' })).toBeInTheDocument();
    expect(requests).toHaveLength(2);
  });
});
