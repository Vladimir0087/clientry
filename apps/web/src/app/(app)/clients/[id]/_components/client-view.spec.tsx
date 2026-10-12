import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';

import { clientKeys } from '@/entities/client';
import { dealKeys } from '@/entities/deal';
import { taskKeys } from '@/entities/task';
import { createQueryClient } from '@/shared/api/query-client';
import type { Client } from '@clientry/shared/clients';
import type { DealListResponse } from '@clientry/shared/deals';

import { ClientView } from './client-view';
import { TEST_CLIENT } from '../../../../../../test/clients';
import { makeDeal, TEST_DEAL, WON_STAGE } from '../../../../../../test/deals';
import { failOnceThenAnswer, failOnceThenWait } from '../../../../../../test/msw/fail-once';
import { problemResponse } from '../../../../../../test/msw/problem';
import { recordRequests } from '../../../../../../test/msw/record';
import { renderWithProviders } from '../../../../../../test/render';
import { CLIENT_RELATED, makeTask, makeTaskPage } from '../../../../../../test/tasks';
import { taskSectionFilters } from '../../../_lib/task-section-filters';

const NO_DEALS: DealListResponse = { items: [], hasMore: false };

function renderCard(client: Client, deals: DealListResponse = NO_DEALS): void {
  const queryClient = createQueryClient();
  queryClient.setQueryData(clientKeys.detail(client.id), client);
  queryClient.setQueryData(dealKeys.byClient(client.id), deals);
  renderWithProviders(<ClientView id={client.id} />, queryClient);
}

describe('ClientView', () => {
  beforeEach(() => {
    recordRequests('get', '/api/deals', () => HttpResponse.json(NO_DEALS));
    recordRequests('get', '/api/tasks', () => HttpResponse.json(makeTaskPage([])));
  });

  it('should list the open tasks, name the deal of a deal row and offer a new task for the client', () => {
    const dealTask = makeTask(1);
    const clientTask = makeTask(2, { related: CLIENT_RELATED });
    const queryClient = createQueryClient();
    queryClient.setQueryData(clientKeys.detail(TEST_CLIENT.id), TEST_CLIENT);
    queryClient.setQueryData(dealKeys.byClient(TEST_CLIENT.id), NO_DEALS);
    queryClient.setQueryData(taskKeys.list(taskSectionFilters({ clientId: TEST_CLIENT.id })), {
      pages: [makeTaskPage([dealTask, clientTask])],
      pageParams: [null],
    });

    renderWithProviders(<ClientView id={TEST_CLIENT.id} />, queryClient);

    const section = screen.getByRole('region', { name: 'Tasks' });
    expect(within(section).getAllByRole('listitem')).toHaveLength(2);
    expect(within(section).getByRole('link', { name: `Deal ${TEST_DEAL.title}` })).toHaveAttribute(
      'href',
      `/deals/${TEST_DEAL.id}`,
    );
    expect(within(section).queryByRole('link', { name: /^Client / })).not.toBeInTheDocument();
    expect(within(section).getAllByText(dealTask.assignee.name)).toHaveLength(2);
    expect(within(section).getByRole('link', { name: 'New task' })).toHaveAttribute(
      'href',
      `/tasks/new?clientId=${TEST_CLIENT.id}`,
    );
  });

  it('should say the client has no open tasks when the list is empty', async () => {
    renderCard(TEST_CLIENT);

    const section = screen.getByRole('region', { name: 'Tasks' });
    expect(await within(section).findByText('No open tasks')).toBeInTheDocument();
  });

  it('should list the deals with stage, amount and assignee when the client has deals', () => {
    const won = makeDeal(2, { title: 'Logo', stage: WON_STAGE, amount: 50000 });
    renderCard(TEST_CLIENT, { items: [TEST_DEAL, won], hasMore: true });

    const section = screen.getByRole('region', { name: 'Deals' });
    expect(within(section).getByRole('link', { name: TEST_DEAL.title })).toHaveAttribute(
      'href',
      `/deals/${TEST_DEAL.id}`,
    );
    expect(within(section).getByText('Paid')).toBeInTheDocument();
    expect(within(section).getByText('$500')).toBeInTheDocument();
    expect(within(section).getByText('Showing the 50 newest deals.')).toBeInTheDocument();
  });

  it('should offer a new deal for the client and say when it has none', () => {
    renderCard(TEST_CLIENT);

    const section = screen.getByRole('region', { name: 'Deals' });
    expect(within(section).getByText('No deals yet')).toBeInTheDocument();
    expect(within(section).getByRole('link', { name: 'New deal' })).toHaveAttribute(
      'href',
      `/deals/new?clientId=${TEST_CLIENT.id}`,
    );
  });

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

  it('should focus the Deals heading when Try again reloads the deals', async () => {
    recordRequests('get', '/api/deals', failOnceThenWait(NO_DEALS));
    const queryClient = createQueryClient();
    queryClient.setQueryData(clientKeys.detail(TEST_CLIENT.id), TEST_CLIENT);
    renderWithProviders(<ClientView id={TEST_CLIENT.id} />, queryClient);

    await userEvent.click(await screen.findByRole('button', { name: 'Try again' }));

    expect(await screen.findByTestId('client-deals-skeleton')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Deals' })).toHaveFocus();
  });

  it('should focus the box the client loads into when Try again reloads the client', async () => {
    recordRequests('get', `/api/clients/${TEST_CLIENT.id}`, failOnceThenWait(TEST_CLIENT));
    renderWithProviders(<ClientView id={TEST_CLIENT.id} />);

    await userEvent.click(await screen.findByRole('button', { name: 'Try again' }));

    const skeleton = await screen.findByTestId('client-details-skeleton');
    expect(skeleton.parentElement).toHaveFocus();
  });

  it('should hand the focus from the box to the client name when Try again loads the client', async () => {
    recordRequests(
      'get',
      `/api/clients/${TEST_CLIENT.id}`,
      failOnceThenAnswer(() => HttpResponse.json(TEST_CLIENT)),
    );
    renderWithProviders(<ClientView id={TEST_CLIENT.id} />);

    await userEvent.click(await screen.findByRole('button', { name: 'Try again' }));

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1, name: TEST_CLIENT.name })).toHaveFocus();
    });
  });

  it('should leave the focus on the page when plain text of the loaded client is clicked', async () => {
    renderCard(TEST_CLIENT);

    await userEvent.click(screen.getByText('No deals yet'));

    expect(document.body).toHaveFocus();
  });

  it('should show the skeleton while the client loads', () => {
    recordRequests('get', `/api/clients/${TEST_CLIENT.id}`, () => HttpResponse.json(TEST_CLIENT));

    renderWithProviders(<ClientView id={TEST_CLIENT.id} />);

    expect(screen.getByTestId('client-details-skeleton')).toBeInTheDocument();
  });
});
