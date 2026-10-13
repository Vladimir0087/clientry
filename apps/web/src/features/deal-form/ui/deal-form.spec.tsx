import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { delay, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';

import { dealKeys, stageKeys } from '@/entities/deal';
import { taskKeys } from '@/entities/task';
import type { TaskFilters } from '@/entities/task';
import { createQueryClient } from '@/shared/api/query-client';
import { PageHeading } from '@/shared/ui/page-heading';

import { CreateDealForm } from './create-deal-form';
import { EditDealForm } from './edit-deal-form';
import { clientPage, makeClient, TEST_CLIENT } from '../../../../test/clients';
import { NEW_STAGE, TEST_DEAL, TEST_STAGES } from '../../../../test/deals';
import { held } from '../../../../test/held';
import { mockRouter } from '../../../../test/mocks/router';
import { failOnceThenAnswer, failOnceThenWait } from '../../../../test/msw/fail-once';
import { problemResponse } from '../../../../test/msw/problem';
import { recordRequests } from '../../../../test/msw/record';
import type { Resolver } from '../../../../test/msw/record';
import { renderWithProviders } from '../../../../test/render';

type User = ReturnType<typeof userEvent.setup>;

const DEAL_PATH = `/deals/${TEST_DEAL.id}`;
const HEADING_ID = 'new-deal-heading';
const OPEN_TASKS: TaskFilters = { assignee: 'me', status: 'open' };
const NO_TASKS = { pages: [{ items: [], nextCursor: null }], pageParams: [null] };

function answerCreate(resolver: Resolver): Request[] {
  return recordRequests('post', '/api/deals', resolver);
}

function answerUpdate(resolver: Resolver): Request[] {
  return recordRequests('patch', `/api/deals/${TEST_DEAL.id}`, resolver);
}

function answerSearch(): Request[] {
  return recordRequests('get', '/api/clients', () => HttpResponse.json(clientPage([TEST_CLIENT])));
}

function searchTerms(requests: readonly Request[]): (string | null)[] {
  return requests.map((request) => new URL(request.url).searchParams.get('q'));
}

async function chooseClient(user: User): Promise<void> {
  await user.click(await screen.findByRole('combobox', { name: 'Client' }));
  await user.click(await screen.findByRole('option', { name: /Romashka LLC/ }));
}

async function fillCreateForm(user: User, amount: string): Promise<void> {
  await user.type(await screen.findByLabelText('Title'), 'Landing page');
  await chooseClient(user);
  await user.type(screen.getByLabelText('Amount'), amount);
}

function renderEdit(): ReturnType<typeof renderWithProviders> {
  const queryClient = createQueryClient();
  queryClient.setQueryData(dealKeys.detail(TEST_DEAL.id), TEST_DEAL);
  return renderWithProviders(<EditDealForm id={TEST_DEAL.id} />, queryClient);
}

describe('deal form', () => {
  describe('create', () => {
    it('should show the errors and send nothing when submitted empty', async () => {
      const requests = answerCreate(() => HttpResponse.json(TEST_DEAL, { status: 201 }));
      const user = userEvent.setup();
      renderWithProviders(<CreateDealForm headingId={HEADING_ID} />);

      await user.click(await screen.findByRole('button', { name: 'Create deal' }));

      expect(await screen.findByLabelText('Title')).toHaveAccessibleDescription('Enter a title');
      expect(screen.getByRole('combobox', { name: 'Client' })).toHaveAccessibleDescription(
        'Choose a client',
      );
      expect(screen.getByLabelText('Amount')).toHaveAccessibleDescription('Enter an amount');
      expect(requests).toHaveLength(0);
    });

    it.each([
      ['1.234', 'Use at most two decimal places'],
      ['-1', 'Amount cannot be negative'],
    ])('should show its message when the amount is %s', async (amount, message) => {
      answerSearch();
      const user = userEvent.setup();
      renderWithProviders(<CreateDealForm headingId={HEADING_ID} />);

      await fillCreateForm(user, amount);
      await user.click(screen.getByRole('button', { name: 'Create deal' }));

      expect(await screen.findByLabelText('Amount')).toHaveAccessibleDescription(message);
    });

    it('should send minor units with the defaults and open the deal page when it succeeds', async () => {
      answerSearch();
      const requests = answerCreate(() => HttpResponse.json(TEST_DEAL, { status: 201 }));
      const user = userEvent.setup();
      renderWithProviders(<CreateDealForm headingId={HEADING_ID} />);

      await fillCreateForm(user, '1,500.50');
      await user.click(screen.getByRole('button', { name: 'Create deal' }));

      await waitFor(() => {
        expect(mockRouter.replace).toHaveBeenCalledWith(DEAL_PATH);
      });
      expect(await requests[0]?.json()).toEqual({
        title: 'Landing page',
        clientId: TEST_CLIENT.id,
        stageId: NEW_STAGE.id,
        amount: 150050,
        currency: 'USD',
        assigneeId: TEST_DEAL.assignee.id,
      });
    });

    it('should mark the stages stale without refetching them when the deal is created', async () => {
      answerSearch();
      answerCreate(() => HttpResponse.json(TEST_DEAL, { status: 201 }));
      const stageRequests = recordRequests('get', '/api/stages', () =>
        HttpResponse.json(TEST_STAGES),
      );
      const queryClient = createQueryClient();
      const user = userEvent.setup();
      renderWithProviders(<CreateDealForm headingId={HEADING_ID} />, queryClient);
      await fillCreateForm(user, '1500');

      await user.click(screen.getByRole('button', { name: 'Create deal' }));

      await waitFor(() => {
        expect(mockRouter.replace).toHaveBeenCalledWith(DEAL_PATH);
      });
      expect(queryClient.getQueryState(stageKeys.list)?.isInvalidated).toBe(true);
      expect(stageRequests).toHaveLength(1);
    });

    it('should focus the deal heading when the deal page opens after create', async () => {
      answerSearch();
      answerCreate(() => HttpResponse.json(TEST_DEAL, { status: 201 }));
      const user = userEvent.setup();
      const { unmount } = renderWithProviders(<CreateDealForm headingId={HEADING_ID} />);
      await fillCreateForm(user, '1500');
      await user.click(screen.getByRole('button', { name: 'Create deal' }));
      await waitFor(() => {
        expect(mockRouter.replace).toHaveBeenCalled();
      });
      unmount();

      renderWithProviders(<PageHeading>{TEST_DEAL.title}</PageHeading>);

      expect(screen.getByRole('heading', { name: TEST_DEAL.title })).toHaveFocus();
    });

    it('should focus the page heading when Try again reloads the form', async () => {
      recordRequests('get', '/api/stages', failOnceThenWait(TEST_STAGES));
      const user = userEvent.setup();
      renderWithProviders(
        <>
          <PageHeading id={HEADING_ID}>New deal</PageHeading>
          <CreateDealForm headingId={HEADING_ID} />
        </>,
      );

      await user.click(await screen.findByRole('button', { name: 'Try again' }));

      expect(await screen.findByTestId('deal-form-skeleton')).toBeInTheDocument();
      expect(screen.getByRole('heading', { level: 1, name: 'New deal' })).toHaveFocus();
    });

    it('should default the assignee to the caller when the form opens', async () => {
      renderWithProviders(<CreateDealForm headingId={HEADING_ID} />);

      expect(await screen.findByRole('combobox', { name: 'Assignee' })).toHaveTextContent(
        TEST_DEAL.assignee.name,
      );
    });

    it('should search one time with the term when typing pauses', async () => {
      const requests = answerSearch();
      const user = userEvent.setup();
      renderWithProviders(<CreateDealForm headingId={HEADING_ID} />);

      await user.click(await screen.findByRole('combobox', { name: 'Client' }));
      await user.type(screen.getByRole('combobox', { name: 'Search clients' }), 'Rom');

      await waitFor(() => {
        expect(searchTerms(requests)).toContain('Rom');
      });
      expect(searchTerms(requests).filter((term) => term !== null)).toEqual(['Rom']);
      expect(new URL(requests.at(-1)?.url ?? '').search).toBe('?q=Rom&sort=name_asc&limit=10');
    });

    it('should choose the first client with Enter when a new term brings the same results', async () => {
      const romResults = held();
      const requests = recordRequests('get', '/api/clients', async ({ request }) => {
        if (new URL(request.url).searchParams.get('q') === 'Rom') {
          await romResults.promise;
        }
        return HttpResponse.json(clientPage([TEST_CLIENT]));
      });
      const user = userEvent.setup();
      renderWithProviders(<CreateDealForm headingId={HEADING_ID} />);

      const picker = await screen.findByRole('combobox', { name: 'Client' });
      await user.click(picker);
      await screen.findByRole('option', { name: /Romashka LLC/ });
      await user.type(screen.getByRole('combobox', { name: 'Search clients' }), 'Rom');
      await waitFor(() => {
        expect(searchTerms(requests)).toContain('Rom');
      });
      expect(screen.getByRole('status')).toHaveTextContent('Loading clients…');
      romResults.release();
      await waitFor(() => {
        expect(screen.getByRole('status')).toBeEmptyDOMElement();
      });
      await user.keyboard('{Enter}');

      await waitFor(() => {
        expect(picker).toHaveTextContent('Romashka LLC');
      });
    });

    it('should search again when Enter is pressed on Try again after a failed search', async () => {
      const requests = recordRequests('get', '/api/clients', () =>
        requests.length === 1
          ? problemResponse(429, 'TOO_MANY_REQUESTS')
          : HttpResponse.json(clientPage([TEST_CLIENT])),
      );
      const user = userEvent.setup();
      renderWithProviders(<CreateDealForm headingId={HEADING_ID} />);

      await user.click(await screen.findByRole('combobox', { name: 'Client' }));
      (await screen.findByRole('button', { name: 'Try again' })).focus();
      await user.keyboard('{Enter}');

      expect(await screen.findByRole('option', { name: /Romashka LLC/ })).toBeInTheDocument();
      expect(requests).toHaveLength(2);
    });

    it('should focus the search field when Try again is pressed after a failed search', async () => {
      const requests = recordRequests('get', '/api/clients', () =>
        requests.length === 1
          ? problemResponse(429, 'TOO_MANY_REQUESTS')
          : HttpResponse.json(clientPage([TEST_CLIENT])),
      );
      const user = userEvent.setup();
      renderWithProviders(<CreateDealForm headingId={HEADING_ID} />);

      await user.click(await screen.findByRole('combobox', { name: 'Client' }));
      await user.click(await screen.findByRole('button', { name: 'Try again' }));

      expect(screen.getByRole('combobox', { name: 'Search clients' })).toHaveFocus();
    });

    it('should say so in the status region when the search finds no clients', async () => {
      recordRequests('get', '/api/clients', () => HttpResponse.json(clientPage([])));
      const user = userEvent.setup();
      renderWithProviders(<CreateDealForm headingId={HEADING_ID} />);

      await user.click(await screen.findByRole('combobox', { name: 'Client' }));

      await waitFor(() => {
        expect(screen.getByRole('status')).toHaveTextContent('No clients found');
      });
    });

    it('should name the client list and mark the current client when it opens', async () => {
      answerSearch();
      recordRequests('get', `/api/clients/${TEST_CLIENT.id}`, () => HttpResponse.json(TEST_CLIENT));
      const user = userEvent.setup();
      renderWithProviders(<CreateDealForm headingId={HEADING_ID} clientId={TEST_CLIENT.id} />);

      await user.click(await screen.findByRole('combobox', { name: 'Client' }));

      expect(screen.getByRole('dialog', { name: 'Choose a client' })).toBeInTheDocument();
      expect(screen.getByRole('listbox', { name: 'Clients' })).toBeInTheDocument();
      expect(
        await screen.findByRole('option', { name: /^Romashka LLC.*\(current client\)/ }),
      ).toBeInTheDocument();
    });

    it('should point aria-controls at the client list only when it is open', async () => {
      answerSearch();
      const user = userEvent.setup();
      renderWithProviders(<CreateDealForm headingId={HEADING_ID} />);

      const picker = await screen.findByRole('combobox', { name: 'Client' });
      expect(picker).not.toHaveAttribute('aria-controls');
      await user.click(picker);

      const listId = picker.getAttribute('aria-controls') ?? '';
      expect(document.getElementById(listId)).toBeInTheDocument();
    });

    it('should show loading over the previous results when a new term is searched', async () => {
      recordRequests('get', '/api/clients', async ({ request }) => {
        if (new URL(request.url).searchParams.get('q') === 'Lil') {
          await delay('infinite');
        }
        return HttpResponse.json(clientPage([TEST_CLIENT]));
      });
      const user = userEvent.setup();
      renderWithProviders(<CreateDealForm headingId={HEADING_ID} />);

      await user.click(await screen.findByRole('combobox', { name: 'Client' }));
      await screen.findByRole('option', { name: /Romashka LLC/ });
      await user.type(screen.getByRole('combobox', { name: 'Search clients' }), 'Lil');

      await waitFor(() => {
        expect(screen.getByRole('status')).toHaveTextContent('Loading clients…');
      });
      expect(screen.getByRole('option', { name: /Romashka LLC/ })).toHaveAttribute(
        'aria-disabled',
        'true',
      );
    });

    it('should choose nothing when Enter is pressed before the new results arrive', async () => {
      recordRequests('get', '/api/clients', async ({ request }) => {
        if (new URL(request.url).searchParams.get('q') === 'Lil') {
          await delay('infinite');
        }
        return HttpResponse.json(clientPage([TEST_CLIENT]));
      });
      const user = userEvent.setup();
      renderWithProviders(<CreateDealForm headingId={HEADING_ID} />);

      await user.click(await screen.findByRole('combobox', { name: 'Client' }));
      await screen.findByRole('option', { name: /Romashka LLC/ });
      await user.type(screen.getByRole('combobox', { name: 'Search clients' }), 'Lil{Enter}');

      expect(screen.getByRole('combobox', { name: 'Search clients' })).toBeInTheDocument();
      expect(screen.getByRole('combobox', { name: 'Client' })).toHaveTextContent('Choose a client');
    });

    it('should choose a client with the arrow keys and Enter and focus the field again when the results show', async () => {
      answerSearch();
      const user = userEvent.setup();
      renderWithProviders(<CreateDealForm headingId={HEADING_ID} />);

      const picker = await screen.findByRole('combobox', { name: 'Client' });
      await user.click(picker);
      await screen.findByRole('option', { name: /Romashka LLC/ });
      await user.keyboard('{ArrowDown}{Enter}');

      await waitFor(() => {
        expect(picker).toHaveFocus();
      });
      expect(picker).toHaveTextContent('Romashka LLC');
    });

    it('should show the client name when the URL gives a client', async () => {
      const client = makeClient(7, { name: 'Lily Inc' });
      recordRequests('get', `/api/clients/${client.id}`, () => HttpResponse.json(client));

      renderWithProviders(<CreateDealForm headingId={HEADING_ID} clientId={client.id} />);

      expect(await screen.findByRole('combobox', { name: 'Client' })).toHaveTextContent('Lily Inc');
    });

    it('should show the client after Try again when the client from the URL failed to load', async () => {
      const client = makeClient(7, { name: 'Lily Inc' });
      recordRequests(
        'get',
        `/api/clients/${client.id}`,
        failOnceThenAnswer(() => HttpResponse.json(client)),
      );
      const user = userEvent.setup();
      renderWithProviders(<CreateDealForm headingId={HEADING_ID} clientId={client.id} />);

      await user.click(await screen.findByRole('button', { name: 'Try again' }));

      expect(await screen.findByRole('combobox', { name: 'Client' })).toHaveTextContent('Lily Inc');
    });

    it('should open the form without a client when the URL gives an unknown one', async () => {
      const client = makeClient(7);
      recordRequests('get', `/api/clients/${client.id}`, () =>
        problemResponse(404, 'CLIENT_NOT_FOUND'),
      );

      renderWithProviders(<CreateDealForm headingId={HEADING_ID} clientId={client.id} />);

      expect(await screen.findByRole('combobox', { name: 'Client' })).toHaveTextContent(
        'Choose a client',
      );
    });

    it('should put the error on the Client field when the server rejects clientId', async () => {
      answerSearch();
      answerCreate(() =>
        problemResponse(400, 'VALIDATION_FAILED', {
          errors: [{ path: 'clientId', message: 'Choose a client' }],
        }),
      );
      const user = userEvent.setup();
      renderWithProviders(<CreateDealForm headingId={HEADING_ID} />);

      await fillCreateForm(user, '1500');
      await user.click(screen.getByRole('button', { name: 'Create deal' }));

      await waitFor(() => {
        expect(screen.getByRole('combobox', { name: 'Client' })).toHaveAccessibleDescription(
          'Choose a client',
        );
      });
    });

    it('should load the stages again when the server rejects stageId', async () => {
      answerSearch();
      answerCreate(() =>
        problemResponse(400, 'VALIDATION_FAILED', {
          errors: [{ path: 'stageId', message: 'Choose a stage' }],
        }),
      );
      const stageReads = recordRequests('get', '/api/stages', () => HttpResponse.json(TEST_STAGES));
      const user = userEvent.setup();
      renderWithProviders(<CreateDealForm headingId={HEADING_ID} />);
      await fillCreateForm(user, '1500');
      const readsBefore = stageReads.length;

      await user.click(screen.getByRole('button', { name: 'Create deal' }));

      await waitFor(() => {
        expect(stageReads.length).toBeGreaterThan(readsBefore);
      });
    });
  });

  describe('edit', () => {
    it('should show the stored amount and disable Save changes when nothing has changed', async () => {
      renderEdit();

      expect(await screen.findByLabelText('Amount')).toHaveValue('1500');
      expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled();
    });

    it('should send the version and only the changed fields when the deal is saved', async () => {
      const requests = answerUpdate(() => HttpResponse.json({ ...TEST_DEAL, amount: 200000 }));
      const user = userEvent.setup();
      renderEdit();

      const amount = await screen.findByLabelText('Amount');
      await user.clear(amount);
      await user.type(amount, '2000');
      await user.click(screen.getByRole('button', { name: 'Save changes' }));

      await waitFor(() => {
        expect(mockRouter.replace).toHaveBeenCalledWith(DEAL_PATH);
      });
      expect(await requests[0]?.json()).toEqual({ version: TEST_DEAL.version, amount: 200000 });
    });

    it('should mark the tasks stale when the deal is saved', async () => {
      answerUpdate(() => HttpResponse.json(TEST_DEAL));
      const user = userEvent.setup();
      const { queryClient } = renderEdit();
      queryClient.setQueryData(taskKeys.list(OPEN_TASKS), NO_TASKS);

      await user.type(await screen.findByLabelText('Title'), '!');
      await user.click(screen.getByRole('button', { name: 'Save changes' }));

      await waitFor(() => {
        expect(queryClient.getQueryState(taskKeys.list(OPEN_TASKS))?.isInvalidated).toBe(true);
      });
    });

    it('should show the newer deal and save at its version when it arrives before any change', async () => {
      const newer = { ...TEST_DEAL, title: 'Landing page v2', version: TEST_DEAL.version + 1 };
      const requests = answerUpdate(() => HttpResponse.json(newer));
      const user = userEvent.setup();
      const { queryClient } = renderEdit();
      const title = await screen.findByLabelText('Title');

      act(() => {
        queryClient.setQueryData(dealKeys.detail(TEST_DEAL.id), newer);
      });
      await waitFor(() => {
        expect(title).toHaveValue('Landing page v2');
      });
      await user.type(title, '!');
      await user.click(screen.getByRole('button', { name: 'Save changes' }));

      await waitFor(() => {
        expect(requests).toHaveLength(1);
      });
      expect(await requests[0]?.json()).toEqual({
        version: newer.version,
        title: 'Landing page v2!',
      });
    });

    it('should keep the typed change and its version when a newer deal arrives after it', async () => {
      const newer = { ...TEST_DEAL, title: 'Landing page v2', version: TEST_DEAL.version + 1 };
      const requests = answerUpdate(() => problemResponse(409, 'DEAL_CHANGED'));
      const user = userEvent.setup();
      const { queryClient } = renderEdit();
      const title = await screen.findByLabelText('Title');

      await user.type(title, '!');
      act(() => {
        queryClient.setQueryData(dealKeys.detail(TEST_DEAL.id), newer);
      });
      await user.click(screen.getByRole('button', { name: 'Save changes' }));

      await waitFor(() => {
        expect(requests).toHaveLength(1);
      });
      expect(title).toHaveValue(`${TEST_DEAL.title}!`);
      expect(await requests[0]?.json()).toEqual({
        version: TEST_DEAL.version,
        title: `${TEST_DEAL.title}!`,
      });
    });

    it('should offer Reload and show the newer deal when someone else changed it', async () => {
      answerUpdate(() => problemResponse(409, 'DEAL_CHANGED'));
      const newer = { ...TEST_DEAL, title: 'Landing page v2', version: TEST_DEAL.version + 1 };
      recordRequests('get', `/api/deals/${TEST_DEAL.id}`, () => HttpResponse.json(newer));
      const user = userEvent.setup();
      renderEdit();

      await user.type(await screen.findByLabelText('Title'), '!');
      await user.click(screen.getByRole('button', { name: 'Save changes' }));
      const alert = await screen.findByRole('alert');
      expect(alert).toHaveTextContent('Someone else changed this deal while you were editing.');
      await user.click(screen.getByRole('button', { name: 'Reload' }));

      await waitFor(() => {
        expect(screen.getByLabelText('Title')).toHaveValue('Landing page v2');
      });
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    it('should send the reloaded version when the form is saved after Reload', async () => {
      const newer = { ...TEST_DEAL, title: 'Landing page v2', version: TEST_DEAL.version + 1 };
      const requests = answerUpdate(() =>
        requests.length === 1 ? problemResponse(409, 'DEAL_CHANGED') : HttpResponse.json(newer),
      );
      recordRequests('get', `/api/deals/${TEST_DEAL.id}`, () => HttpResponse.json(newer));
      const user = userEvent.setup();
      renderEdit();

      await user.type(await screen.findByLabelText('Title'), '!');
      await user.click(screen.getByRole('button', { name: 'Save changes' }));
      await user.click(await screen.findByRole('button', { name: 'Reload' }));
      await waitFor(() => {
        expect(screen.getByLabelText('Title')).toHaveValue('Landing page v2');
      });
      await user.type(screen.getByLabelText('Title'), '!');
      await user.click(screen.getByRole('button', { name: 'Save changes' }));

      await waitFor(() => {
        expect(requests).toHaveLength(2);
      });
      expect(await requests[1]?.json()).toEqual({
        version: newer.version,
        title: 'Landing page v2!',
      });
    });

    it('should focus the title when the newer deal is reloaded', async () => {
      answerUpdate(() => problemResponse(409, 'DEAL_CHANGED'));
      recordRequests('get', `/api/deals/${TEST_DEAL.id}`, () => HttpResponse.json(TEST_DEAL));
      const user = userEvent.setup();
      renderEdit();

      await user.type(await screen.findByLabelText('Title'), '!');
      await user.click(screen.getByRole('button', { name: 'Save changes' }));
      await user.click(await screen.findByRole('button', { name: 'Reload' }));

      await waitFor(() => {
        expect(screen.getByLabelText('Title')).toHaveFocus();
      });
    });

    it('should keep Reload and explain when reloading the newer deal fails', async () => {
      answerUpdate(() => problemResponse(409, 'DEAL_CHANGED'));
      recordRequests('get', `/api/deals/${TEST_DEAL.id}`, () =>
        problemResponse(429, 'TOO_MANY_REQUESTS'),
      );
      const user = userEvent.setup();
      renderEdit();

      await user.type(await screen.findByLabelText('Title'), '!');
      await user.click(screen.getByRole('button', { name: 'Save changes' }));
      await user.click(await screen.findByRole('button', { name: 'Reload' }));

      await waitFor(() => {
        expect(screen.getByRole('alert')).toHaveTextContent(
          'Could not reload the deal. Try again.',
        );
      });
      expect(screen.getByRole('button', { name: 'Reload' })).toBeInTheDocument();
    });

    it('should show not found with focus on its heading when Reload finds the deal deleted', async () => {
      answerUpdate(() => problemResponse(409, 'DEAL_CHANGED'));
      recordRequests('get', `/api/deals/${TEST_DEAL.id}`, () =>
        problemResponse(404, 'DEAL_NOT_FOUND'),
      );
      const user = userEvent.setup();
      renderEdit();
      await user.type(await screen.findByLabelText('Title'), '!');
      await user.click(screen.getByRole('button', { name: 'Save changes' }));

      await user.click(await screen.findByRole('button', { name: 'Reload' }));

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'Deal not found' })).toHaveFocus();
      });
    });

    it('should focus the not found heading when Try again finds the deal deleted', async () => {
      recordRequests(
        'get',
        `/api/deals/${TEST_DEAL.id}`,
        failOnceThenAnswer(() => problemResponse(404, 'DEAL_NOT_FOUND')),
      );
      const user = userEvent.setup();
      renderWithProviders(<EditDealForm id={TEST_DEAL.id} />);

      await user.click(await screen.findByRole('button', { name: 'Try again' }));

      await waitFor(() => {
        expect(screen.getByRole('heading', { level: 1, name: 'Deal not found' })).toHaveFocus();
      });
    });

    it('should say the deal no longer exists when the save gets a 404', async () => {
      answerUpdate(() => problemResponse(404, 'DEAL_NOT_FOUND'));
      const user = userEvent.setup();
      renderEdit();

      await user.type(await screen.findByLabelText('Title'), '!');
      await user.click(screen.getByRole('button', { name: 'Save changes' }));

      expect(await screen.findByRole('alert')).toHaveTextContent('This deal no longer exists.');
      expect(screen.getByRole('link', { name: 'Back to deals' })).toHaveAttribute('href', '/deals');
    });
  });
});
