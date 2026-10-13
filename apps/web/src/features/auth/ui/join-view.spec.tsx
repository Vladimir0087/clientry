import { focusManager } from '@tanstack/react-query';
import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest';

import { sessionKeys } from '@/entities/session';

import { JoinView } from './join-view';
import { TEST_SESSION } from '../../../../test/fixtures';
import { held } from '../../../../test/held';
import { mockRouter } from '../../../../test/mocks/router';
import { problemResponse } from '../../../../test/msw/problem';
import { recordRequests } from '../../../../test/msw/record';
import type { Resolver } from '../../../../test/msw/record';
import { renderWithProviders } from '../../../../test/render';

const TOKEN = 'q3V8Hn1xKZ0bWcR5tYp2LmA9sEoJfDgU7iNvXwC4hBk';
const EMAIL = 'max@example.com';
const PASSWORD = 'correct horse battery';
const PREVIEW = {
  workspace: { name: 'Pixel Studio' },
  invitedBy: { name: 'Ann' },
  expiresAt: '2026-10-16T12:00:00.000Z',
};
const MANAGER_SESSION = { ...TEST_SESSION, role: 'manager' } as const;

function openWithHash(hash: string): void {
  window.history.replaceState(null, '', `/join${hash}`);
}

function answerPreview(resolver: Resolver = () => HttpResponse.json(PREVIEW)): Request[] {
  return recordRequests('post', '/api/auth/invite/preview', resolver);
}

// MSW records a request in an async handler, so a check for "no request" waits for it first.
async function settleRequests(): Promise<void> {
  await act(() => new Promise((resolve) => setTimeout(resolve, 50)));
}

function renderJoin(hasSession = false): ReturnType<typeof renderWithProviders> {
  return renderWithProviders(<JoinView hasSession={hasSession} />);
}

async function fillRegistration(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  await user.type(await screen.findByLabelText('Your name'), 'Max');
  await user.type(screen.getByLabelText('Email'), EMAIL);
  await user.type(screen.getByLabelText('Password'), PASSWORD);
}

describe('JoinView', () => {
  let meRequests: Request[];

  beforeEach(() => {
    meRequests = recordRequests('get', '/api/auth/me', () => HttpResponse.json(TEST_SESSION));
  });

  afterEach(async () => {
    await settleRequests();
    openWithHash('');
    expect(meRequests).toHaveLength(0);
  });

  it('should say the link is incomplete and ask nothing when there is no fragment', async () => {
    const requests = answerPreview();
    openWithHash('');

    renderJoin();
    await settleRequests();

    expect(screen.getByRole('heading', { name: 'Invite link incomplete' })).toBeInTheDocument();
    expect(requests).toHaveLength(0);
  });

  it('should say the invite is not valid and ask nothing when the token is malformed', async () => {
    const requests = answerPreview();
    openWithHash('#too-short');

    renderJoin();
    await settleRequests();

    expect(screen.getByRole('heading', { name: 'Invite not valid' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Log in' })).toHaveAttribute('href', '/login');
    expect(requests).toHaveLength(0);
  });

  it('should record the preview by the time requests settle when the token is valid', async () => {
    const requests = answerPreview();
    openWithHash(`#${TOKEN}`);

    renderJoin();
    await settleRequests();

    expect(requests).toHaveLength(1);
  });

  it('should show the workspace, inviter and expiry when the preview answers', async () => {
    const requests = answerPreview();
    openWithHash(`#${TOKEN}`);

    renderJoin();

    expect(await screen.findByRole('heading', { name: 'Join Pixel Studio' })).toBeInTheDocument();
    expect(
      screen.getByText('Ann invited you to join as a manager. The link expires on Oct 16, 2026.'),
    ).toBeInTheDocument();
    expect(await requests[0]?.json()).toEqual({ token: TOKEN });
  });

  it('should not ask for the preview again when the window regains focus minutes later', async () => {
    const requests = answerPreview();
    openWithHash(`#${TOKEN}`);
    renderJoin();
    await screen.findByRole('heading', { name: 'Join Pixel Studio' });
    vi.useFakeTimers({ toFake: ['Date'] });
    onTestFinished(() => {
      vi.useRealTimers();
      focusManager.setFocused(undefined);
    });
    vi.setSystemTime(Date.now() + 10 * 60_000);

    act(() => {
      focusManager.setFocused(false);
      focusManager.setFocused(true);
    });
    await settleRequests();

    expect(requests).toHaveLength(1);
  });

  it('should say the invite is not valid when the preview answers 404', async () => {
    answerPreview(() => problemResponse(404, 'INVITE_INVALID'));
    openWithHash(`#${TOKEN}`);

    renderJoin();

    expect(await screen.findByRole('heading', { name: 'Invite not valid' })).toBeInTheDocument();
  });

  it('should register with the token, store the session and go home when an account is created', async () => {
    answerPreview();
    const joins = recordRequests('post', '/api/auth/invite/register', () =>
      HttpResponse.json(MANAGER_SESSION, { status: 201 }),
    );
    openWithHash(`#${TOKEN}`);
    const user = userEvent.setup();
    const { queryClient } = renderJoin();

    await fillRegistration(user);
    await user.click(screen.getByRole('button', { name: 'Create account and join' }));

    await waitFor(() => {
      expect(mockRouter.replace).toHaveBeenCalledWith('/');
    });
    expect(await joins[0]?.json()).toEqual({
      token: TOKEN,
      name: 'Max',
      email: EMAIL,
      password: PASSWORD,
    });
    expect(queryClient.getQueryData(sessionKeys.current)).toEqual(MANAGER_SESSION);
  });

  it('should put the message on the email when the email is taken', async () => {
    answerPreview();
    recordRequests('post', '/api/auth/invite/register', () => problemResponse(409, 'EMAIL_TAKEN'));
    openWithHash(`#${TOKEN}`);
    const user = userEvent.setup();
    renderJoin();

    await fillRegistration(user);
    await user.click(screen.getByRole('button', { name: 'Create account and join' }));

    expect(await screen.findByLabelText('Email')).toHaveAccessibleDescription(
      'An account with this email already exists. Log in to join instead.',
    );
  });

  it('should disable switching to log in when the join is being sent', async () => {
    answerPreview();
    const answered = Promise.withResolvers<undefined>();
    recordRequests('post', '/api/auth/invite/register', async () => {
      await answered.promise;
      return problemResponse(409, 'EMAIL_TAKEN');
    });
    openWithHash(`#${TOKEN}`);
    const user = userEvent.setup();
    renderJoin();

    await fillRegistration(user);
    await user.click(screen.getByRole('button', { name: 'Create account and join' }));

    expect(await screen.findByRole('button', { name: 'Log in to join' })).toBeDisabled();
    answered.resolve(undefined);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Log in to join' })).toBeEnabled();
    });
  });

  it('should keep focus on the heading while Try again loads the invite and after it', async () => {
    const retry = held();
    let isFailing = true;
    answerPreview(async () => {
      if (isFailing) {
        return problemResponse(403, 'FORBIDDEN');
      }
      await retry.promise;
      return HttpResponse.json(PREVIEW);
    });
    openWithHash(`#${TOKEN}`);
    const user = userEvent.setup();
    renderJoin();
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Join workspace' }),
    ).toBeInTheDocument();
    isFailing = false;

    await user.click(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByTestId('join-skeleton')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Join workspace' })).toHaveFocus();
    retry.release();
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Join Pixel Studio' }),
    ).toHaveFocus();
  });

  it('should focus the invalid heading when Try again ends in 404', async () => {
    let isFailing = true;
    answerPreview(() =>
      isFailing ? problemResponse(403, 'FORBIDDEN') : problemResponse(404, 'INVITE_INVALID'),
    );
    openWithHash(`#${TOKEN}`);
    const user = userEvent.setup();
    renderJoin();
    await screen.findByRole('button', { name: 'Try again' });
    isFailing = false;

    await user.click(screen.getByRole('button', { name: 'Try again' }));

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Invite not valid' }),
    ).toHaveFocus();
  });

  it('should keep the typed email and focus the first empty field when switching to log in', async () => {
    answerPreview();
    openWithHash(`#${TOKEN}`);
    const user = userEvent.setup();
    renderJoin();

    await user.type(await screen.findByLabelText('Email'), EMAIL);
    await user.click(screen.getByRole('button', { name: 'Log in to join' }));

    expect(screen.getByRole('button', { name: 'Log in and join' })).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toHaveValue(EMAIL);
    expect(screen.getByLabelText('Password')).toHaveFocus();
    expect(screen.queryByLabelText('Your name')).not.toBeInTheDocument();
  });

  it('should keep focus in the empty field and show no error when the mode switch is pressed', async () => {
    answerPreview();
    openWithHash(`#${TOKEN}`);
    const user = userEvent.setup();
    renderJoin();
    await user.click(await screen.findByRole('button', { name: 'Log in to join' }));

    await user.pointer({
      keys: '[MouseLeft>]',
      target: screen.getByRole('button', { name: 'Create an account' }),
    });

    expect(screen.getByLabelText('Email')).toHaveFocus();
    expect(screen.queryByText('Enter your email')).not.toBeInTheDocument();
  });

  describe('log in to join', () => {
    async function submitLogin(answer: Resolver): Promise<ReturnType<typeof userEvent.setup>> {
      answerPreview();
      recordRequests('post', '/api/auth/invite/login', answer);
      openWithHash(`#${TOKEN}`);
      const user = userEvent.setup();
      renderJoin();
      await user.click(await screen.findByRole('button', { name: 'Log in to join' }));
      await user.type(screen.getByLabelText('Email'), EMAIL);
      await user.type(screen.getByLabelText('Password'), PASSWORD);
      await user.click(screen.getByRole('button', { name: 'Log in and join' }));
      return user;
    }

    it('should show an alert when the account already belongs to a workspace', async () => {
      await submitLogin(() => problemResponse(409, 'ALREADY_IN_WORKSPACE'));

      expect(
        await screen.findByText(
          'This account already belongs to a workspace. Use another account.',
        ),
      ).toBeInTheDocument();
    });

    it('should clear and focus the password when the credentials are wrong', async () => {
      await submitLogin(() => problemResponse(401, 'INVALID_CREDENTIALS'));

      expect(await screen.findByText('Email or password is incorrect.')).toBeInTheDocument();
      const password = screen.getByLabelText('Password');
      expect(password).toHaveValue('');
      expect(password).toHaveFocus();
    });

    it('should say how long to wait when too many attempts were made', async () => {
      await submitLogin(() =>
        problemResponse(429, 'TOO_MANY_REQUESTS', { headers: { 'Retry-After': '30' } }),
      );

      expect(
        await screen.findByText('Too many attempts. Try again in 30 seconds.'),
      ).toBeInTheDocument();
    });

    it('should switch to the invalid state and focus its heading when the invite stopped working', async () => {
      await submitLogin(() => problemResponse(404, 'INVITE_INVALID'));

      expect(await screen.findByRole('heading', { name: 'Invite not valid' })).toHaveFocus();
    });
  });

  it.each([
    [true, 1],
    [false, 0],
  ])(
    'should show the signed-in notice only when the browser holds a session (%s)',
    async (hasSession, count) => {
      answerPreview();
      openWithHash(`#${TOKEN}`);

      renderJoin(hasSession);

      await screen.findByRole('heading', { name: 'Join Pixel Studio' });
      expect(
        screen.queryAllByText(
          'You are signed in on this browser. Joining signs you out of that account first.',
        ),
      ).toHaveLength(count);
    },
  );

  it('should announce the signed-in notice as a status rather than an alert when the browser holds a session', async () => {
    answerPreview();
    openWithHash(`#${TOKEN}`);

    renderJoin(true);

    const notice = await screen.findByText(
      'You are signed in on this browser. Joining signs you out of that account first.',
    );
    expect(notice.closest('[data-slot="alert"]')).toHaveAttribute('role', 'status');
  });
});
