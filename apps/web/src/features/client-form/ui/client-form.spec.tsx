import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';

import { clientKeys } from '@/entities/client';
import { createQueryClient } from '@/shared/api/query-client';
import { PageHeading } from '@/shared/ui/page-heading';

import { CreateClientForm } from './create-client-form';
import { EditClientForm } from './edit-client-form';
import { TEST_CLIENT } from '../../../../test/clients';
import { mockRouter } from '../../../../test/mocks/router';
import { failOnceThenAnswer, failOnceThenWait } from '../../../../test/msw/fail-once';
import { problemResponse } from '../../../../test/msw/problem';
import { recordRequests } from '../../../../test/msw/record';
import type { Resolver } from '../../../../test/msw/record';
import { renderWithProviders } from '../../../../test/render';

const CARD_PATH = `/clients/${TEST_CLIENT.id}`;

function answerCreate(resolver: Resolver): Request[] {
  return recordRequests('post', '/api/clients', resolver);
}

function answerUpdate(resolver: Resolver): Request[] {
  return recordRequests('patch', `/api/clients/${TEST_CLIENT.id}`, resolver);
}

function renderEdit(): ReturnType<typeof renderWithProviders> {
  const queryClient = createQueryClient();
  queryClient.setQueryData(clientKeys.detail(TEST_CLIENT.id), TEST_CLIENT);
  return renderWithProviders(<EditClientForm id={TEST_CLIENT.id} />, queryClient);
}

async function bodyOf(request: Request | undefined): Promise<unknown> {
  return request?.json();
}

describe('client form', () => {
  describe('create', () => {
    it('should show the name error and send nothing when submitted empty', async () => {
      const requests = answerCreate(() => HttpResponse.json(TEST_CLIENT, { status: 201 }));
      renderWithProviders(<CreateClientForm />);

      await userEvent.click(screen.getByRole('button', { name: 'Create client' }));

      expect(await screen.findByLabelText('Name')).toHaveAccessibleDescription('Enter a name');
      expect(requests).toHaveLength(0);
    });

    it('should send trimmed values and replace the route with the card when it succeeds', async () => {
      const requests = answerCreate(() => HttpResponse.json(TEST_CLIENT, { status: 201 }));
      const user = userEvent.setup();
      renderWithProviders(<CreateClientForm />);

      await user.type(screen.getByLabelText('Name'), '  Romashka LLC  ');
      await user.type(screen.getByLabelText('Email'), ' Hello@Romashka.example ');
      await user.type(screen.getByLabelText('Tags'), 'VIP,');
      await user.click(screen.getByRole('button', { name: 'Create client' }));

      await waitFor(() => {
        expect(mockRouter.replace).toHaveBeenCalledWith(CARD_PATH);
      });
      expect(await bodyOf(requests[0])).toEqual({
        name: 'Romashka LLC',
        company: '',
        email: 'hello@romashka.example',
        phone: '',
        source: null,
        tags: ['vip'],
        notes: '',
      });
    });

    it('should mark the tags stale without refetching them when the client is created', async () => {
      answerCreate(() => HttpResponse.json(TEST_CLIENT, { status: 201 }));
      const tagReads = recordRequests('get', '/api/clients/tags', () =>
        HttpResponse.json({ items: [] }),
      );
      const user = userEvent.setup();
      const { queryClient } = renderWithProviders(<CreateClientForm />);
      await waitFor(() => {
        expect(tagReads).toHaveLength(1);
      });

      await user.type(screen.getByLabelText('Name'), 'Ann');
      await user.click(screen.getByRole('button', { name: 'Create client' }));

      await waitFor(() => {
        expect(mockRouter.replace).toHaveBeenCalledWith(CARD_PATH);
      });
      const tagsState = queryClient.getQueryState(clientKeys.tags);
      expect(tagsState?.isInvalidated).toBe(true);
      expect(tagsState?.fetchStatus).toBe('idle');
      expect(tagReads).toHaveLength(1);
    });

    it('should focus the card heading when the card opens after create', async () => {
      answerCreate(() => HttpResponse.json(TEST_CLIENT, { status: 201 }));
      const user = userEvent.setup();
      const { unmount } = renderWithProviders(<CreateClientForm />);
      await user.type(screen.getByLabelText('Name'), 'Romashka LLC');
      await user.click(screen.getByRole('button', { name: 'Create client' }));
      await waitFor(() => {
        expect(mockRouter.replace).toHaveBeenCalled();
      });
      unmount();

      renderWithProviders(<PageHeading>Romashka LLC</PageHeading>);

      expect(screen.getByRole('heading', { name: 'Romashka LLC' })).toHaveFocus();
    });

    it('should put server errors on email and on tags when the API rejects tags.0', async () => {
      answerCreate(() =>
        problemResponse(400, 'VALIDATION_FAILED', {
          errors: [
            { path: 'email', message: 'Enter a valid email' },
            { path: 'tags.0', message: 'Tags cannot contain commas' },
          ],
        }),
      );
      const user = userEvent.setup();
      renderWithProviders(<CreateClientForm />);

      await user.type(screen.getByLabelText('Name'), 'Ann');
      await user.click(screen.getByRole('button', { name: 'Create client' }));

      const email = await screen.findByLabelText('Email');
      await waitFor(() => {
        expect(email).toHaveAccessibleDescription('Enter a valid email');
      });
      expect(screen.getByLabelText('Tags')).toHaveAccessibleDescription(
        'Press Enter or comma to add a tag. Tags cannot contain commas',
      );
      expect(email).toHaveFocus();
    });

    it('should show the generic alert with the reference when the API fails', async () => {
      answerCreate(() => problemResponse(500, 'INTERNAL_ERROR', { requestId: 'req-500' }));
      const user = userEvent.setup();
      renderWithProviders(<CreateClientForm />);

      await user.type(screen.getByLabelText('Name'), 'Ann');
      await user.click(screen.getByRole('button', { name: 'Create client' }));

      const alert = await screen.findByRole('alert');
      expect(alert).toHaveTextContent('Something went wrong. Try again.');
      expect(alert).toHaveTextContent('Reference: req-500');
    });

    it('should submit a null source when Not set is chosen', async () => {
      const requests = answerCreate(() => HttpResponse.json(TEST_CLIENT, { status: 201 }));
      const user = userEvent.setup();
      renderWithProviders(<CreateClientForm />);
      await user.type(screen.getByLabelText('Name'), 'Ann');

      await user.click(screen.getByLabelText('Source'));
      await user.click(await screen.findByRole('option', { name: 'Telegram' }));
      await user.click(screen.getByLabelText('Source'));
      await user.click(await screen.findByRole('option', { name: 'Not set' }));
      await user.click(screen.getByRole('button', { name: 'Create client' }));

      await waitFor(() => {
        expect(requests).toHaveLength(1);
      });
      expect(await bodyOf(requests[0])).toMatchObject({ source: null });
    });
  });

  describe('edit', () => {
    it('should focus the Edit client heading when Try again reloads the client', async () => {
      recordRequests('get', `/api/clients/${TEST_CLIENT.id}`, failOnceThenWait(TEST_CLIENT));
      renderWithProviders(<EditClientForm id={TEST_CLIENT.id} />);

      await userEvent.click(await screen.findByRole('button', { name: 'Try again' }));

      expect(await screen.findByTestId('client-form-skeleton')).toBeInTheDocument();
      expect(screen.getByRole('heading', { level: 1, name: 'Edit client' })).toHaveFocus();
    });

    it('should focus the not found heading when Try again finds the client deleted', async () => {
      recordRequests(
        'get',
        `/api/clients/${TEST_CLIENT.id}`,
        failOnceThenAnswer(() => problemResponse(404, 'CLIENT_NOT_FOUND')),
      );
      renderWithProviders(<EditClientForm id={TEST_CLIENT.id} />);

      await userEvent.click(await screen.findByRole('button', { name: 'Try again' }));

      await waitFor(() => {
        expect(screen.getByRole('heading', { level: 1, name: 'Client not found' })).toHaveFocus();
      });
    });

    it('should keep Save changes disabled until a field changes', async () => {
      const user = userEvent.setup();
      renderEdit();
      const save = screen.getByRole('button', { name: 'Save changes' });

      expect(save).toBeDisabled();
      await user.type(screen.getByLabelText('Company'), ' Group');

      expect(save).toBeEnabled();
    });

    it('should send only the changed fields when it is saved', async () => {
      const requests = answerUpdate(() => HttpResponse.json(TEST_CLIENT));
      const user = userEvent.setup();
      renderEdit();

      await user.clear(screen.getByLabelText('Phone'));
      await user.click(screen.getByRole('button', { name: 'Remove tag warm' }));
      await user.click(screen.getByRole('button', { name: 'Save changes' }));

      await waitFor(() => {
        expect(mockRouter.replace).toHaveBeenCalledWith(CARD_PATH);
      });
      expect(await bodyOf(requests[0])).toEqual({ phone: '', tags: ['landing'] });
    });

    it('should say the client no longer exists when the save answers 404', async () => {
      answerUpdate(() => problemResponse(404, 'CLIENT_NOT_FOUND'));
      const user = userEvent.setup();
      renderEdit();

      await user.type(screen.getByLabelText('Company'), ' Group');
      await user.click(screen.getByRole('button', { name: 'Save changes' }));

      const alert = await screen.findByRole('alert');
      expect(alert).toHaveTextContent('This client no longer exists.');
      expect(screen.getByRole('link', { name: 'Back to clients' })).toHaveAttribute(
        'href',
        '/clients',
      );
    });
  });
});
