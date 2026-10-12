import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { delay, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';

import { HomeGreeting } from './home-greeting';
import { TEST_SESSION } from '../../../../test/fixtures';
import { failOnceThenAnswer, failOnceThenWait } from '../../../../test/msw/fail-once';
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

  it('should focus the box the greeting loads into when Try again reloads the session', async () => {
    recordRequests('get', '/api/auth/me', failOnceThenWait(TEST_SESSION));
    renderWithProviders(<HomeGreeting />);

    await userEvent.click(await screen.findByRole('button', { name: 'Try again' }));

    const skeleton = await screen.findByTestId('greeting-skeleton');
    expect(skeleton.parentElement).toHaveFocus();
  });

  it('should hand the focus from the box to the greeting when Try again loads the session', async () => {
    recordRequests(
      'get',
      '/api/auth/me',
      failOnceThenAnswer(() => HttpResponse.json(TEST_SESSION)),
    );
    renderWithProviders(<HomeGreeting />);

    await userEvent.click(await screen.findByRole('button', { name: 'Try again' }));

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Welcome, Ann Lee' })).toHaveFocus();
    });
  });

  it('should leave the focus on the page when plain text of the greeting is clicked', async () => {
    renderWithProviders(<HomeGreeting />);

    await userEvent.click(await screen.findByText('Acme Studio · Owner'));

    expect(document.body).toHaveFocus();
  });
});
