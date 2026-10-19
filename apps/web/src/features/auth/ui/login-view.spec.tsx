import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';

import { sessionKeys } from '@/entities/session';
import type { SessionResponse } from '@clientry/shared/auth';

import { LoginView } from './login-view';
import { TEST_SESSION } from '../../../../test/fixtures';
import { held } from '../../../../test/held';
import { mockRouter } from '../../../../test/mocks/router';
import { problemResponse } from '../../../../test/msw/problem';
import { recordRequests } from '../../../../test/msw/record';
import type { Resolver } from '../../../../test/msw/record';
import { renderWithProviders } from '../../../../test/render';

const DEMO_SESSION: SessionResponse = {
  ...TEST_SESSION,
  workspace: { ...TEST_SESSION.workspace, name: 'Pixel Studio', isDemo: true },
};

const OWNER_ENTRY = 'Explore the demo';
const MANAGER_ENTRY = 'or see it as a manager';

function renderLoginView(next?: string): ReturnType<typeof renderWithProviders> {
  return renderWithProviders(<LoginView next={next} />);
}

function answerDemo(resolver: Resolver): Request[] {
  return recordRequests('post', '/api/auth/demo', resolver);
}

function button(name: string): HTMLElement {
  return screen.getByRole('button', { name });
}

describe('LoginView', () => {
  it.each([
    [OWNER_ENTRY, 'owner'],
    [MANAGER_ENTRY, 'manager'],
  ])('should post the %s role to the demo route when it is pressed', async (name, role) => {
    const requests = answerDemo(() => HttpResponse.json(DEMO_SESSION));
    renderLoginView();

    await userEvent.click(button(name));

    await waitFor(() => {
      expect(requests).toHaveLength(1);
    });
    expect(await requests[0]?.json()).toEqual({ role });
  });

  it.each([
    ['/', undefined],
    ['/deals', '/deals'],
  ])(
    'should write the demo session and go to %s when the demo entry succeeds with next %s',
    async (target, next) => {
      answerDemo(() => HttpResponse.json(DEMO_SESSION));
      const { queryClient } = renderLoginView(next);

      await userEvent.click(button(OWNER_ENTRY));

      await waitFor(() => {
        expect(mockRouter.replace).toHaveBeenCalledWith(target);
      });
      expect(queryClient.getQueryData(sessionKeys.current)).toEqual(DEMO_SESSION);
    },
  );

  it('should disable all three buttons and spin only the pressed one when a demo entry is pending', async () => {
    const response = held();
    answerDemo(async () => {
      await response.promise;
      return HttpResponse.json(DEMO_SESSION);
    });
    renderLoginView();

    await userEvent.click(button(MANAGER_ENTRY));

    await waitFor(() => {
      expect(button(MANAGER_ENTRY)).toBeDisabled();
    });
    expect(button(OWNER_ENTRY)).toBeDisabled();
    expect(button('Log in')).toBeDisabled();
    expect(button(MANAGER_ENTRY).querySelector('[data-icon="inline-start"]')).not.toBeNull();
    expect(button(OWNER_ENTRY).querySelector('[data-icon="inline-start"]')).toBeNull();
    response.release();
    await waitFor(() => {
      expect(mockRouter.replace).toHaveBeenCalled();
    });
    expect(button(OWNER_ENTRY)).toBeDisabled();
  });

  it('should disable both demo buttons while a login is pending', async () => {
    const response = held();
    recordRequests('post', '/api/auth/login', async () => {
      await response.promise;
      return HttpResponse.json(TEST_SESSION);
    });
    const user = userEvent.setup();
    renderLoginView();
    await user.type(screen.getByLabelText('Email'), 'ann@example.com');
    await user.type(screen.getByLabelText('Password'), 'correct horse battery');

    await user.click(button('Log in'));

    await waitFor(() => {
      expect(button(OWNER_ENTRY)).toBeDisabled();
    });
    expect(button(MANAGER_ENTRY)).toBeDisabled();
    response.release();
    await waitFor(() => {
      expect(mockRouter.replace).toHaveBeenCalledWith('/');
    });
  });

  it('should say the demo is being prepared and keep focus on the pressed button when it answers 503', async () => {
    answerDemo(() => problemResponse(503, 'DEMO_UNAVAILABLE'));
    renderLoginView();

    await userEvent.click(button(OWNER_ENTRY));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The demo is being prepared. Try again in a minute.',
    );
    await waitFor(() => {
      expect(button(OWNER_ENTRY)).toHaveFocus();
    });
    expect(button('Log in')).toBeEnabled();
  });

  it('should show the rate limit alert when the demo route answers 429', async () => {
    answerDemo(() =>
      problemResponse(429, 'TOO_MANY_REQUESTS', { headers: { 'Retry-After': '30' } }),
    );
    renderLoginView();

    await userEvent.click(button(MANAGER_ENTRY));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Too many attempts. Try again in 30 seconds.',
    );
    await waitFor(() => {
      expect(button(MANAGER_ENTRY)).toHaveFocus();
    });
  });

  it('should show the generic alert with the reference when the demo route fails', async () => {
    answerDemo(() => problemResponse(500, 'INTERNAL_ERROR', { requestId: 'req-500' }));
    renderLoginView();

    await userEvent.click(button(OWNER_ENTRY));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Something went wrong. Try again.');
    expect(alert).toHaveTextContent('Reference: req-500');
  });

  it('should log in with email and password as before when the form is submitted', async () => {
    recordRequests('post', '/api/auth/login', () => HttpResponse.json(TEST_SESSION));
    const user = userEvent.setup();
    const { queryClient } = renderLoginView();
    await user.type(screen.getByLabelText('Email'), 'ann@example.com');
    await user.type(screen.getByLabelText('Password'), 'correct horse battery');

    await user.click(button('Log in'));

    await waitFor(() => {
      expect(mockRouter.replace).toHaveBeenCalledWith('/');
    });
    expect(queryClient.getQueryData(sessionKeys.current)).toEqual(TEST_SESSION);
  });

  it('should reach both demo buttons after the login form when moving by Tab', async () => {
    const user = userEvent.setup();
    renderLoginView();

    await user.click(screen.getByLabelText('Email'));
    const order: string[] = [];
    for (let step = 0; step < 6; step += 1) {
      await user.tab();
      order.push(document.activeElement?.textContent ?? '');
    }

    expect(order.indexOf(OWNER_ENTRY)).toBeGreaterThan(order.indexOf('Log in'));
    expect(order.indexOf(MANAGER_ENTRY)).toBe(order.indexOf(OWNER_ENTRY) + 1);
  });
});
