import { onlineManager } from '@tanstack/react-query';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { delay, HttpResponse } from 'msw';
import { afterEach, describe, expect, it } from 'vitest';

import { sessionKeys } from '@/entities/session';

import { LoginForm } from './login-form';
import { TEST_SESSION } from '../../../../test/fixtures';
import { mockRouter } from '../../../../test/mocks/router';
import { problemResponse } from '../../../../test/msw/problem';
import { recordRequests } from '../../../../test/msw/record';
import type { Resolver } from '../../../../test/msw/record';
import { renderWithProviders } from '../../../../test/render';

const EMAIL = 'ann@example.com';
const PASSWORD = 'correct horse battery';

function renderLoginForm(next?: string): ReturnType<typeof renderWithProviders> {
  return renderWithProviders(<LoginForm next={next} />);
}

async function submit(email = EMAIL, password = PASSWORD): Promise<void> {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText('Email'), email);
  await user.type(screen.getByLabelText('Password'), password);
  await user.click(screen.getByRole('button', { name: 'Log in' }));
}

function answerLogin(response: Resolver): Request[] {
  return recordRequests('post', '/api/auth/login', response);
}

describe('LoginForm', () => {
  afterEach(() => {
    onlineManager.setOnline(true);
  });

  it('should show a message under each field and send nothing when submitted empty', async () => {
    const requests = answerLogin(() => HttpResponse.json(TEST_SESSION));
    renderLoginForm();

    await userEvent.click(screen.getByRole('button', { name: 'Log in' }));

    const email = screen.getByLabelText('Email');
    const password = screen.getByLabelText('Password');
    expect(email).toHaveAttribute('aria-invalid', 'true');
    expect(email).toHaveAccessibleDescription('Enter your email');
    expect(password).toHaveAttribute('aria-invalid', 'true');
    expect(password).toHaveAccessibleDescription('Enter your password');
    expect(requests).toHaveLength(0);
  });

  it('should clear and focus the password and keep the email when the credentials are wrong', async () => {
    answerLogin(() => problemResponse(401, 'INVALID_CREDENTIALS'));
    renderLoginForm();

    await submit();

    expect(await screen.findByRole('alert')).toHaveTextContent('Email or password is incorrect.');
    const password = screen.getByLabelText('Password');
    expect(password).toHaveValue('');
    expect(password).toHaveFocus();
    expect(screen.getByLabelText('Email')).toHaveValue(EMAIL);
  });

  it('should put server field errors under their fields and the rest in the alert when validation fails', async () => {
    answerLogin(() =>
      problemResponse(400, 'VALIDATION_FAILED', {
        errors: [
          { path: 'email', message: 'Enter a valid email' },
          { path: '', message: 'Request body is invalid' },
        ],
      }),
    );
    renderLoginForm();

    await submit();

    expect(await screen.findByRole('alert')).toHaveTextContent('Request body is invalid');
    const email = screen.getByLabelText('Email');
    expect(email).toHaveAccessibleDescription('Enter a valid email');
    expect(email).toHaveFocus();
  });

  it('should explain the problem when the account has no workspace', async () => {
    answerLogin(() => problemResponse(403, 'NO_WORKSPACE'));
    renderLoginForm();

    await submit();

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('This account is not a member of any workspace.');
    expect(alert).toHaveFocus();
  });

  it.each([
    ['1', 'Too many attempts. Try again in 1 second.'],
    ['30', 'Too many attempts. Try again in 30 seconds.'],
    ['60', 'Too many attempts. Try again in 1 minute.'],
    ['3540', 'Too many attempts. Try again in 59 minutes.'],
  ])('should name the wait when Retry-After is %s', async (retryAfter, message) => {
    answerLogin(() =>
      problemResponse(429, 'TOO_MANY_REQUESTS', { headers: { 'Retry-After': retryAfter } }),
    );
    renderLoginForm();

    await submit();

    expect(await screen.findByRole('alert')).toHaveTextContent(message);
  });

  it('should ask to try later when a 429 has no Retry-After', async () => {
    answerLogin(() => problemResponse(429, 'TOO_MANY_REQUESTS'));
    renderLoginForm();

    await submit();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Too many attempts. Try again later.',
    );
  });

  it('should show the generic alert with the reference when the API fails', async () => {
    answerLogin(() => problemResponse(500, 'INTERNAL_ERROR', { requestId: 'req-500' }));
    renderLoginForm();

    await submit();

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Something went wrong. Try again.');
    expect(alert).toHaveTextContent('Reference: req-500');
  });

  it('should show the generic alert without a reference when the browser is offline', async () => {
    onlineManager.setOnline(false);
    answerLogin(() => HttpResponse.error());
    renderLoginForm();

    await submit();

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Something went wrong. Try again.');
    expect(alert).not.toHaveTextContent('Reference');
  });

  it('should send one request when the button is double-clicked while pending', async () => {
    const requests = answerLogin(async () => {
      await delay(50);
      return HttpResponse.json(TEST_SESSION);
    });
    const user = userEvent.setup();
    renderLoginForm();
    await user.type(screen.getByLabelText('Email'), EMAIL);
    await user.type(screen.getByLabelText('Password'), PASSWORD);

    await user.dblClick(screen.getByRole('button', { name: 'Log in' }));

    await waitFor(() => {
      expect(mockRouter.replace).toHaveBeenCalled();
    });
    expect(requests).toHaveLength(1);
  });

  it.each([
    ['/', undefined],
    ['/clients?q=a', '/clients?q=a'],
    ['/', '//evil.example'],
  ])(
    'should replace the cache with the session and go to %s when login succeeds with next %s',
    async (target, next) => {
      answerLogin(() => HttpResponse.json(TEST_SESSION));
      const { queryClient } = renderLoginForm(next);
      queryClient.setQueryData(['clients'], ['previous user data']);

      await submit();

      await waitFor(() => {
        expect(mockRouter.replace).toHaveBeenCalledWith(target);
      });
      expect(queryClient.getQueryData(['clients'])).toBeUndefined();
      expect(queryClient.getQueryData(sessionKeys.current)).toEqual(TEST_SESSION);
    },
  );

  it('should keep the button disabled when login succeeds and the page is changing', async () => {
    answerLogin(() => HttpResponse.json(TEST_SESSION));
    renderLoginForm();

    await submit();

    await waitFor(() => {
      expect(mockRouter.replace).toHaveBeenCalled();
    });
    expect(screen.getByRole('button', { name: 'Log in' })).toBeDisabled();
  });

  it('should keep next in the link to registration when next is given', () => {
    renderLoginForm('/clients');

    expect(screen.getByRole('link', { name: 'Create one' })).toHaveAttribute(
      'href',
      '/register?next=%2Fclients',
    );
  });
});
