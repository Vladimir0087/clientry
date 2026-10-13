import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';

import { sessionKeys } from '@/entities/session';

import { RegisterForm } from './register-form';
import { TEST_SESSION } from '../../../../test/fixtures';
import { mockRouter } from '../../../../test/mocks/router';
import { problemResponse } from '../../../../test/msw/problem';
import { recordRequests } from '../../../../test/msw/record';
import { renderWithProviders } from '../../../../test/render';

const HINT = 'At least 12 characters';

function renderRegisterForm(next?: string): ReturnType<typeof renderWithProviders> {
  return renderWithProviders(<RegisterForm next={next} />);
}

async function submit(): Promise<void> {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText('Your name'), 'Ann Lee');
  await user.type(screen.getByLabelText('Workspace name'), 'Acme Studio');
  await user.type(screen.getByLabelText('Email'), 'ann@example.com');
  await user.type(screen.getByLabelText('Password'), 'correct horse battery');
  await user.click(screen.getByRole('button', { name: 'Create account' }));
}

describe('RegisterForm', () => {
  it('should describe the password with its hint when the form renders', () => {
    renderRegisterForm();

    expect(screen.getByLabelText('Password')).toHaveAccessibleDescription(HINT);
  });

  it('should keep focus in the empty field and show no error when the link to log in is pressed', async () => {
    const user = userEvent.setup();
    renderRegisterForm();
    await user.click(screen.getByLabelText('Email'));

    await user.pointer({
      keys: '[MouseLeft>]',
      target: screen.getByRole('link', { name: 'Log in' }),
    });

    expect(screen.getByLabelText('Email')).toHaveFocus();
    expect(screen.queryByText('Enter your email')).not.toBeInTheDocument();
  });

  it('should show one message per field when submitted empty', async () => {
    const requests = recordRequests('post', '/api/auth/register', () =>
      HttpResponse.json(TEST_SESSION),
    );
    renderRegisterForm();

    await userEvent.click(screen.getByRole('button', { name: 'Create account' }));

    expect(screen.getByLabelText('Your name')).toHaveAccessibleDescription('Enter your name');
    expect(screen.getByLabelText('Workspace name')).toHaveAccessibleDescription(
      'Enter a workspace name',
    );
    expect(screen.getByLabelText('Email')).toHaveAccessibleDescription('Enter your email');
    expect(screen.getByLabelText('Password')).toHaveAccessibleDescription(
      `${HINT} Enter your password`,
    );
    expect(requests).toHaveLength(0);
  });

  it('should flag the email when an account with it already exists', async () => {
    recordRequests('post', '/api/auth/register', () => problemResponse(409, 'EMAIL_TAKEN'));
    renderRegisterForm();

    await submit();

    const email = screen.getByLabelText('Email');
    await waitFor(() => {
      expect(email).toHaveAccessibleDescription('An account with this email already exists.');
    });
    expect(email).toHaveAttribute('aria-invalid', 'true');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it.each([
    ['/', undefined],
    ['/clients', '/clients'],
  ])(
    'should replace the cache with the session and go to %s when registration succeeds with next %s',
    async (target, next) => {
      recordRequests('post', '/api/auth/register', () =>
        HttpResponse.json(TEST_SESSION, { status: 201 }),
      );
      const { queryClient } = renderRegisterForm(next);
      queryClient.setQueryData(['clients'], ['previous user data']);

      await submit();

      await waitFor(() => {
        expect(mockRouter.replace).toHaveBeenCalledWith(target);
      });
      expect(queryClient.getQueryData(['clients'])).toBeUndefined();
      expect(queryClient.getQueryData(sessionKeys.current)).toEqual(TEST_SESSION);
    },
  );

  it('should show the wait in minutes when registration is rate limited', async () => {
    recordRequests('post', '/api/auth/register', () =>
      problemResponse(429, 'TOO_MANY_REQUESTS', { headers: { 'Retry-After': '3540' } }),
    );
    renderRegisterForm();

    await submit();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Too many attempts. Try again in 59 minutes.',
    );
  });
});
