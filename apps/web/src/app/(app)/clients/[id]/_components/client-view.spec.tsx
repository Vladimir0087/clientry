import { screen } from '@testing-library/react';
import { HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';

import { clientKeys } from '@/entities/client';
import { createQueryClient } from '@/shared/api/query-client';
import type { Client } from '@clientry/shared/clients';

import { ClientView } from './client-view';
import { TEST_CLIENT } from '../../../../../../test/clients';
import { problemResponse } from '../../../../../../test/msw/problem';
import { recordRequests } from '../../../../../../test/msw/record';
import { renderWithProviders } from '../../../../../../test/render';

function renderCard(client: Client): void {
  const queryClient = createQueryClient();
  queryClient.setQueryData(clientKeys.detail(client.id), client);
  renderWithProviders(<ClientView id={client.id} />, queryClient);
}

describe('ClientView', () => {
  it('should link the email and the dialable phone when both are set', () => {
    renderCard(TEST_CLIENT);

    expect(screen.getByRole('link', { name: TEST_CLIENT.email ?? '' })).toHaveAttribute(
      'href',
      'mailto:hello@romashka.example',
    );
    expect(screen.getByRole('link', { name: TEST_CLIENT.phone ?? '' })).toHaveAttribute(
      'href',
      'tel:+375291234567',
    );
  });

  it('should keep the line breaks of the notes when they span lines', () => {
    renderCard(TEST_CLIENT);

    const notes = screen.getByText(/Wants a landing page/);
    expect(notes.textContent).toBe('Wants a landing page.\nCall after 3 pm.');
    expect(notes).toHaveClass('whitespace-pre-line');
  });

  it('should show a dash for each empty field when the client has only a name', () => {
    renderCard({
      ...TEST_CLIENT,
      company: null,
      email: null,
      phone: null,
      source: null,
      notes: null,
      tags: [],
    });

    expect(screen.getAllByText('—')).toHaveLength(4);
    expect(screen.getByText('No notes')).toBeInTheDocument();
  });

  it('should show the not found state when the API answers 404', async () => {
    recordRequests('get', `/api/clients/${TEST_CLIENT.id}`, () =>
      problemResponse(404, 'CLIENT_NOT_FOUND'),
    );

    renderWithProviders(<ClientView id={TEST_CLIENT.id} />);

    expect(await screen.findByRole('heading', { name: 'Client not found' })).toBeInTheDocument();
    expect(screen.getByText('It may have been deleted.')).toBeInTheDocument();
  });

  it('should show not found instead of the cached client when the refetch answers 404', async () => {
    recordRequests('get', `/api/clients/${TEST_CLIENT.id}`, () =>
      problemResponse(404, 'CLIENT_NOT_FOUND'),
    );
    const queryClient = createQueryClient();
    queryClient.setQueryData(clientKeys.detail(TEST_CLIENT.id), TEST_CLIENT);
    await queryClient.invalidateQueries({ queryKey: clientKeys.detail(TEST_CLIENT.id) });

    renderWithProviders(<ClientView id={TEST_CLIENT.id} />, queryClient);

    expect(await screen.findByRole('heading', { name: 'Client not found' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: TEST_CLIENT.name })).not.toBeInTheDocument();
  });

  it('should show the skeleton while the client loads', () => {
    recordRequests('get', `/api/clients/${TEST_CLIENT.id}`, () => HttpResponse.json(TEST_CLIENT));

    renderWithProviders(<ClientView id={TEST_CLIENT.id} />);

    expect(screen.getByTestId('client-details-skeleton')).toBeInTheDocument();
  });
});
