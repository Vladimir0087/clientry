import { fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { delay, HttpResponse } from 'msw';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { taskKeys } from '@/entities/task';
import { createQueryClient } from '@/shared/api/query-client';
import type { DealListResponse } from '@clientry/shared/deals';
import type { Task } from '@clientry/shared/tasks';

import { CreateTaskForm } from './create-task-form';
import { EditTaskForm } from './edit-task-form';
import { clientPage, makeClient, TEST_CLIENT } from '../../../../test/clients';
import { makeDeal, TEST_DEAL } from '../../../../test/deals';
import { TEST_SESSION } from '../../../../test/fixtures';
import { mockRouter } from '../../../../test/mocks/router';
import { failOnceThenAnswer } from '../../../../test/msw/fail-once';
import { problemResponse } from '../../../../test/msw/problem';
import { recordRequests } from '../../../../test/msw/record';
import type { Resolver } from '../../../../test/msw/record';
import { renderWithProviders } from '../../../../test/render';
import { CLIENT_RELATED, makeTask, TEST_TASK } from '../../../../test/tasks';

type User = ReturnType<typeof userEvent.setup>;

const HEADING_ID = 'new-task-heading';
const TASK_PAGE = `/tasks/${TEST_TASK.id}`;
const HOUR_MS = 3_600_000;
// The clock stands at 14:00 on this day, so the default due time of 09:00 has passed.
const TODAY = '2026-10-12';

// The browser's zone, as the form reads the inputs.
function localInstant(date: string, time: string): string {
  return new Date(`${date}T${time}:00`).toISOString();
}

function answerCreate(resolver: Resolver): Request[] {
  return recordRequests('post', '/api/tasks', resolver);
}

function answerUpdate(resolver: Resolver): Request[] {
  return recordRequests('patch', `/api/tasks/${TEST_TASK.id}`, resolver);
}

function rejectField(path: string, message: string): Response {
  return problemResponse(400, 'VALIDATION_FAILED', { errors: [{ path, message }] });
}

function answerClientDeals(deals: DealListResponse): Request[] {
  return recordRequests('get', '/api/deals', () => HttpResponse.json(deals));
}

function answerClient(): void {
  recordRequests('get', `/api/clients/${TEST_CLIENT.id}`, () => HttpResponse.json(TEST_CLIENT));
}

function answerDeal(): void {
  recordRequests('get', `/api/deals/${TEST_DEAL.id}`, () => HttpResponse.json(TEST_DEAL));
}

function stopClockAtTwoPm(): void {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 9, 12, 14, 0));
}

function reminderSelect(): HTMLElement {
  return screen.getByRole('combobox', { name: 'Reminder' });
}

function setInput(label: string, value: string): void {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

async function choose(user: User, field: string, option: string): Promise<void> {
  await user.click(screen.getByRole('combobox', { name: field }));
  await user.click(await screen.findByRole('option', { name: option }));
}

async function fillRequired(user: User, title = 'Call Romashka'): Promise<void> {
  await user.type(await screen.findByLabelText('Title'), title);
  setInput('Due date', '2099-10-15');
}

function renderEdit(task: Task = TEST_TASK): ReturnType<typeof renderWithProviders> {
  const queryClient = createQueryClient();
  queryClient.setQueryData(taskKeys.detail(task.id), task);
  return renderWithProviders(<EditTaskForm id={task.id} />, queryClient);
}

describe('task form', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  describe('create', () => {
    it('should show the errors and send nothing when submitted empty', async () => {
      const requests = answerCreate(() => HttpResponse.json(TEST_TASK, { status: 201 }));
      const user = userEvent.setup();
      renderWithProviders(<CreateTaskForm headingId={HEADING_ID} />);

      await user.click(await screen.findByRole('button', { name: 'Create task' }));

      expect(await screen.findByLabelText('Title')).toHaveAccessibleDescription('Enter a title');
      expect(screen.getByLabelText('Due date')).toHaveAccessibleDescription('Choose a due date');
      expect(requests).toHaveLength(0);
    });

    it('should ask for the reminder date and time when Custom time is left empty', async () => {
      const user = userEvent.setup();
      renderWithProviders(<CreateTaskForm headingId={HEADING_ID} />);
      await user.type(await screen.findByLabelText('Title'), 'Call');

      await choose(user, 'Reminder', 'Custom time');
      setInput('Reminder time', '');
      await user.click(screen.getByRole('button', { name: 'Create task' }));

      expect(await screen.findByLabelText('Reminder date')).toHaveAccessibleDescription(
        'Choose a reminder date',
      );
      expect(screen.getByLabelText('Reminder time')).toHaveAccessibleDescription(
        'Choose a reminder time',
      );
    });

    it('should send instants built from the local fields and open the task when it succeeds', async () => {
      const requests = answerCreate(() => HttpResponse.json(TEST_TASK, { status: 201 }));
      const user = userEvent.setup();
      renderWithProviders(<CreateTaskForm headingId={HEADING_ID} />);

      await fillRequired(user);
      await choose(user, 'Reminder', '1 hour before');
      await user.click(screen.getByRole('button', { name: 'Create task' }));

      await waitFor(() => {
        expect(mockRouter.replace).toHaveBeenCalledWith(TASK_PAGE);
      });
      const dueAt = localInstant('2099-10-15', '09:00');
      expect(await requests[0]?.json()).toEqual({
        title: 'Call Romashka',
        dueAt,
        remindAt: new Date(Date.parse(dueAt) - HOUR_MS).toISOString(),
        assigneeId: TEST_SESSION.user.id,
        related: null,
      });
    });

    it('should start a custom reminder at the due date and 09:00 when Custom time is chosen', async () => {
      const user = userEvent.setup();
      renderWithProviders(<CreateTaskForm headingId={HEADING_ID} />);

      await fillRequired(user);
      await choose(user, 'Reminder', 'Custom time');

      expect(screen.getByLabelText('Reminder date')).toHaveValue('2099-10-15');
      expect(screen.getByLabelText('Reminder time')).toHaveValue('09:00');
    });

    it('should say the reminder must be ahead and send nothing when the chosen reminder has passed', async () => {
      const requests = answerCreate(() => HttpResponse.json(TEST_TASK, { status: 201 }));
      const user = userEvent.setup();
      renderWithProviders(<CreateTaskForm headingId={HEADING_ID} />);

      await fillRequired(user);
      await choose(user, 'Reminder', '1 hour before');
      setInput('Due date', '2000-01-03');
      await user.click(screen.getByRole('button', { name: 'Create task' }));

      expect(await screen.findByRole('combobox', { name: 'Reminder' })).toHaveAccessibleDescription(
        'Choose a time in the future',
      );
      expect(requests).toHaveLength(0);
    });

    it('should choose No reminder and send none when the task is due today at a passed time', async () => {
      stopClockAtTwoPm();
      const requests = answerCreate(() => HttpResponse.json(TEST_TASK, { status: 201 }));
      const user = userEvent.setup();
      renderWithProviders(<CreateTaskForm headingId={HEADING_ID} />);

      await user.type(await screen.findByLabelText('Title'), 'Call');
      setInput('Due date', TODAY);
      await user.click(screen.getByRole('button', { name: 'Create task' }));

      await waitFor(() => {
        expect(requests).toHaveLength(1);
      });
      expect(reminderSelect()).toHaveTextContent('No reminder');
      expect(await requests[0]?.json()).toMatchObject({
        dueAt: localInstant(TODAY, '09:00'),
        remindAt: null,
      });
    });

    it('should go back to At due time when the due time moves ahead and no reminder was chosen', async () => {
      stopClockAtTwoPm();
      renderWithProviders(<CreateTaskForm headingId={HEADING_ID} />);
      await screen.findByLabelText('Title');

      setInput('Due date', TODAY);
      setInput('Due time', '18:00');

      expect(reminderSelect()).toHaveTextContent('At due time');
      expect(reminderSelect()).not.toHaveTextContent('(passed)');
    });

    it('should keep the reminder the user chose when the due date changes', async () => {
      const user = userEvent.setup();
      renderWithProviders(<CreateTaskForm headingId={HEADING_ID} />);
      await screen.findByLabelText('Title');

      setInput('Due date', '2000-01-03');
      await choose(user, 'Reminder', 'Custom time');
      setInput('Due date', '2099-10-15');

      expect(reminderSelect()).toHaveTextContent('Custom time');
    });

    it.each([
      [
        'closed with Escape',
        async (user: User): Promise<void> => {
          await user.keyboard('{Escape}');
        },
      ],
      [
        'the shown option is chosen again',
        async (user: User): Promise<void> => {
          await user.click(await screen.findByRole('option', { name: 'No reminder' }));
        },
      ],
    ])(
      'should keep No reminder when the due time moves ahead after the Reminder list was opened and %s',
      async (_case, closeList) => {
        stopClockAtTwoPm();
        const user = userEvent.setup();
        renderWithProviders(<CreateTaskForm headingId={HEADING_ID} />);
        await screen.findByLabelText('Title');
        setInput('Due date', TODAY);

        await user.click(reminderSelect());
        await closeList(user);
        setInput('Due time', '18:00');

        expect(reminderSelect()).toHaveTextContent('No reminder');
      },
    );

    it('should default the assignee to the caller when the form opens', async () => {
      renderWithProviders(<CreateTaskForm headingId={HEADING_ID} />);

      expect(await screen.findByRole('combobox', { name: 'Assignee' })).toHaveTextContent(
        TEST_SESSION.user.name,
      );
    });

    it('should fill the client and go back to its card on Cancel when the URL gives a client', async () => {
      answerClient();
      answerClientDeals({ items: [], hasMore: false });

      renderWithProviders(<CreateTaskForm headingId={HEADING_ID} clientId={TEST_CLIENT.id} />);

      expect(await screen.findByRole('combobox', { name: 'Client' })).toHaveTextContent(
        TEST_CLIENT.name,
      );
      expect(screen.getByRole('combobox', { name: 'Deal' })).toHaveTextContent('No deal');
      expect(screen.getByRole('link', { name: 'Cancel' })).toHaveAttribute(
        'href',
        `/clients/${TEST_CLIENT.id}`,
      );
    });

    it('should fill the client and the deal and go back to the deal on Cancel when the URL gives a deal', async () => {
      answerDeal();
      answerClientDeals({ items: [], hasMore: false });

      renderWithProviders(<CreateTaskForm headingId={HEADING_ID} dealId={TEST_DEAL.id} />);

      expect(await screen.findByRole('combobox', { name: 'Client' })).toHaveTextContent(
        TEST_CLIENT.name,
      );
      expect(screen.getByRole('combobox', { name: 'Deal' })).toHaveTextContent(TEST_DEAL.title);
      expect(screen.getByRole('link', { name: 'Cancel' })).toHaveAttribute(
        'href',
        `/deals/${TEST_DEAL.id}`,
      );
    });

    it('should go back to the list on Cancel and keep Deal off when nothing is given', async () => {
      renderWithProviders(<CreateTaskForm headingId={HEADING_ID} />);

      expect(await screen.findByRole('link', { name: 'Cancel' })).toHaveAttribute('href', '/tasks');
      expect(screen.getByRole('combobox', { name: 'Deal' })).toBeDisabled();
    });

    it('should send the deal as related when a deal of the client is chosen', async () => {
      answerClient();
      answerClientDeals({ items: [TEST_DEAL], hasMore: false });
      const requests = answerCreate(() => HttpResponse.json(TEST_TASK, { status: 201 }));
      const user = userEvent.setup();
      renderWithProviders(<CreateTaskForm headingId={HEADING_ID} clientId={TEST_CLIENT.id} />);

      await fillRequired(user);
      await choose(user, 'Deal', TEST_DEAL.title);
      await user.click(screen.getByRole('button', { name: 'Create task' }));

      await waitFor(() => {
        expect(requests).toHaveLength(1);
      });
      expect(await requests[0]?.json()).toMatchObject({
        related: { kind: 'deal', id: TEST_DEAL.id },
      });
    });

    it('should list the linked deal when the client deals lack it', async () => {
      answerDeal();
      answerClientDeals({ items: [makeDeal(2, { title: 'Logo' })], hasMore: true });
      const user = userEvent.setup();
      renderWithProviders(<CreateTaskForm headingId={HEADING_ID} dealId={TEST_DEAL.id} />);

      await user.click(await screen.findByRole('combobox', { name: 'Deal' }));

      const options = await screen.findAllByRole('option');
      expect(options.map((option) => option.textContent)).toEqual([
        'No deal',
        'Logo',
        TEST_DEAL.title,
      ]);
    });

    it('should disable Deal and say the deals are loading when the client deals are on their way', async () => {
      answerClient();
      recordRequests('get', '/api/deals', async () => {
        await delay('infinite');
        return HttpResponse.json({ items: [], hasMore: false });
      });

      renderWithProviders(<CreateTaskForm headingId={HEADING_ID} clientId={TEST_CLIENT.id} />);

      const deal = await screen.findByRole('combobox', { name: 'Deal' });
      expect(deal).toBeDisabled();
      expect(deal).toHaveAccessibleDescription('Loading deals…');
    });

    it('should say the client deals could not load when their request fails', async () => {
      answerClient();
      recordRequests('get', '/api/deals', () => problemResponse(400, 'VALIDATION_FAILED'));

      renderWithProviders(<CreateTaskForm headingId={HEADING_ID} clientId={TEST_CLIENT.id} />);

      expect(await screen.findByText("We could not load the client's deals.")).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
      expect(screen.getByRole('combobox', { name: 'Deal' })).toBeDisabled();
    });

    it('should focus Client and load the deals again when Try again is pressed', async () => {
      answerClient();
      recordRequests(
        'get',
        '/api/deals',
        failOnceThenAnswer(() => HttpResponse.json({ items: [TEST_DEAL], hasMore: false })),
      );
      const user = userEvent.setup();
      renderWithProviders(<CreateTaskForm headingId={HEADING_ID} clientId={TEST_CLIENT.id} />);

      await user.click(await screen.findByRole('button', { name: 'Try again' }));

      expect(screen.getByRole('combobox', { name: 'Client' })).toHaveFocus();
      await waitFor(() => {
        expect(screen.getByRole('combobox', { name: 'Deal' })).toBeEnabled();
      });
      expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument();
    });

    it('should reset Deal to No deal when another client is chosen', async () => {
      answerDeal();
      answerClientDeals({ items: [], hasMore: false });
      const other = makeClient(7, { name: 'Lily Inc' });
      recordRequests('get', '/api/clients', () => HttpResponse.json(clientPage([other])));
      const user = userEvent.setup();
      renderWithProviders(<CreateTaskForm headingId={HEADING_ID} dealId={TEST_DEAL.id} />);

      await user.click(await screen.findByRole('combobox', { name: 'Client' }));
      await user.click(await screen.findByRole('option', { name: /Lily Inc/ }));

      expect(screen.getByRole('combobox', { name: 'Client' })).toHaveTextContent('Lily Inc');
      expect(screen.getByRole('combobox', { name: 'Deal' })).toHaveTextContent('No deal');
    });

    it('should clear the client and the deal and focus the picker when Remove client is pressed', async () => {
      answerDeal();
      answerClientDeals({ items: [], hasMore: false });
      const user = userEvent.setup();
      renderWithProviders(<CreateTaskForm headingId={HEADING_ID} dealId={TEST_DEAL.id} />);

      await user.click(await screen.findByRole('button', { name: 'Remove client' }));

      const picker = screen.getByRole('combobox', { name: 'Client' });
      expect(picker).toHaveTextContent('Choose a client');
      expect(picker).toHaveFocus();
      expect(screen.getByRole('combobox', { name: 'Deal' })).toBeDisabled();
    });

    it('should put the error on Deal when the server rejects the deal', async () => {
      answerClient();
      answerClientDeals({ items: [TEST_DEAL], hasMore: false });
      answerCreate(() =>
        problemResponse(400, 'VALIDATION_FAILED', {
          errors: [{ path: 'related.id', message: 'Choose a deal' }],
        }),
      );
      const user = userEvent.setup();
      renderWithProviders(<CreateTaskForm headingId={HEADING_ID} clientId={TEST_CLIENT.id} />);

      await fillRequired(user);
      await choose(user, 'Deal', TEST_DEAL.title);
      await user.click(screen.getByRole('button', { name: 'Create task' }));

      await waitFor(() => {
        expect(screen.getByRole('combobox', { name: 'Deal' })).toHaveAccessibleDescription(
          'Choose a deal',
        );
      });
    });

    it('should put the error on Client when the server rejects the client sent alone', async () => {
      answerClient();
      answerClientDeals({ items: [], hasMore: false });
      answerCreate(() => rejectField('related.id', 'Choose a client'));
      const user = userEvent.setup();
      renderWithProviders(<CreateTaskForm headingId={HEADING_ID} clientId={TEST_CLIENT.id} />);

      await fillRequired(user);
      await user.click(screen.getByRole('button', { name: 'Create task' }));

      await waitFor(() => {
        expect(screen.getByRole('combobox', { name: 'Client' })).toHaveAccessibleDescription(
          'Choose a client',
        );
      });
    });

    it('should put the error on Assignee when the server rejects the assignee', async () => {
      answerCreate(() => rejectField('assigneeId', 'Choose a member'));
      const user = userEvent.setup();
      renderWithProviders(<CreateTaskForm headingId={HEADING_ID} />);

      await fillRequired(user);
      await user.click(screen.getByRole('button', { name: 'Create task' }));

      await waitFor(() => {
        expect(screen.getByRole('combobox', { name: 'Assignee' })).toHaveAccessibleDescription(
          'Choose a member',
        );
      });
    });

    it('should put the reminder error on Reminder when a shortcut was sent', async () => {
      answerCreate(() => rejectField('remindAt', 'Choose a time in the future'));
      const user = userEvent.setup();
      renderWithProviders(<CreateTaskForm headingId={HEADING_ID} />);

      await fillRequired(user);
      await choose(user, 'Reminder', '1 hour before');
      await user.click(screen.getByRole('button', { name: 'Create task' }));

      await waitFor(() => {
        expect(reminderSelect()).toHaveAccessibleDescription('Choose a time in the future');
      });
    });

    it('should put the reminder error on Reminder date when a custom time was sent', async () => {
      answerCreate(() => rejectField('remindAt', 'Choose a time in the future'));
      const user = userEvent.setup();
      renderWithProviders(<CreateTaskForm headingId={HEADING_ID} />);

      await fillRequired(user);
      await choose(user, 'Reminder', 'Custom time');
      await user.click(screen.getByRole('button', { name: 'Create task' }));

      await waitFor(() => {
        expect(screen.getByLabelText('Reminder date')).toHaveAccessibleDescription(
          'Choose a time in the future',
        );
      });
    });

    it('should load the client deals again when the server refuses the deal', async () => {
      answerClient();
      const dealLists = answerClientDeals({ items: [TEST_DEAL], hasMore: false });
      answerCreate(() =>
        problemResponse(400, 'VALIDATION_FAILED', {
          errors: [{ path: 'related.id', message: 'Choose a deal' }],
        }),
      );
      const user = userEvent.setup();
      renderWithProviders(<CreateTaskForm headingId={HEADING_ID} clientId={TEST_CLIENT.id} />);

      await fillRequired(user);
      await choose(user, 'Deal', TEST_DEAL.title);
      await user.click(screen.getByRole('button', { name: 'Create task' }));

      await waitFor(() => {
        expect(dealLists).toHaveLength(2);
      });
    });

    it('should show the waking-up alert when the host answers 502 without problem details', async () => {
      answerCreate(() => new HttpResponse('<html>Bad gateway</html>', { status: 502 }));
      const user = userEvent.setup();
      renderWithProviders(<CreateTaskForm headingId={HEADING_ID} />);

      await fillRequired(user);
      await user.click(screen.getByRole('button', { name: 'Create task' }));

      expect(await screen.findByRole('alert')).toHaveTextContent(
        'The server is waking up or busy. Try again in a minute.',
      );
    });
  });

  describe('edit', () => {
    it('should show the stored values with Save changes disabled when the form opens', async () => {
      answerClientDeals({ items: [], hasMore: false });

      renderEdit(makeTask(1, { id: TEST_TASK.id, related: CLIENT_RELATED }));

      expect(await screen.findByLabelText('Title')).toHaveValue('Task 1');
      expect(reminderSelect()).toHaveTextContent('1 hour before');
      expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled();
    });

    it('should enable Save changes when a field changes', async () => {
      answerClientDeals({ items: [], hasMore: false });
      const user = userEvent.setup();
      renderEdit(makeTask(1, { id: TEST_TASK.id, related: CLIENT_RELATED }));

      await user.type(await screen.findByLabelText('Title'), '!');

      expect(screen.getByRole('button', { name: 'Save changes' })).toBeEnabled();
    });

    it('should send only the changed fields and open the task when it is saved', async () => {
      const requests = answerUpdate(() => HttpResponse.json(TEST_TASK));
      answerClientDeals({ items: [], hasMore: false });
      const user = userEvent.setup();
      renderEdit();

      await user.type(await screen.findByLabelText('Title'), '!');
      await user.click(screen.getByRole('button', { name: 'Save changes' }));

      await waitFor(() => {
        expect(mockRouter.replace).toHaveBeenCalledWith(TASK_PAGE);
      });
      expect(await requests[0]?.json()).toEqual({ title: `${TEST_TASK.title}!` });
    });

    it('should keep Save changes disabled when Custom time is chosen and the shortcut chosen again', async () => {
      answerClientDeals({ items: [], hasMore: false });
      const user = userEvent.setup();
      renderEdit();

      await screen.findByLabelText('Title');
      await choose(user, 'Reminder', 'Custom time');
      await choose(user, 'Reminder', '1 hour before');

      expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled();
    });

    it('should send only the title when the stored times hold seconds the inputs cannot show', async () => {
      const requests = answerUpdate(() => HttpResponse.json(TEST_TASK));
      answerClientDeals({ items: [], hasMore: false });
      const user = userEvent.setup();
      renderEdit({
        ...TEST_TASK,
        dueAt: '2099-10-15T12:00:30.000Z',
        remindAt: '2099-10-15T11:00:30.000Z',
      });

      await user.type(await screen.findByLabelText('Title'), '!');
      await user.click(screen.getByRole('button', { name: 'Save changes' }));

      await waitFor(() => {
        expect(requests).toHaveLength(1);
      });
      expect(await requests[0]?.json()).toEqual({ title: `${TEST_TASK.title}!` });
    });

    it('should clear the error on the due date when the due time is changed', async () => {
      answerUpdate(() =>
        problemResponse(400, 'VALIDATION_FAILED', {
          errors: [{ path: 'dueAt', message: 'Choose a date between 2000 and 2099' }],
        }),
      );
      answerClientDeals({ items: [], hasMore: false });
      const user = userEvent.setup();
      renderEdit();

      await user.type(await screen.findByLabelText('Title'), '!');
      await user.click(screen.getByRole('button', { name: 'Save changes' }));
      expect(await screen.findByLabelText('Due date')).toHaveAccessibleDescription(
        'Choose a date between 2000 and 2099',
      );
      setInput('Due time', '10:00');

      await waitFor(() => {
        expect(screen.getByLabelText('Due date')).not.toHaveAccessibleDescription();
      });
    });

    it('should go back to the task page on Cancel when a task is edited', async () => {
      answerClientDeals({ items: [], hasMore: false });

      renderEdit();

      expect(await screen.findByRole('link', { name: 'Cancel' })).toHaveAttribute(
        'href',
        TASK_PAGE,
      );
    });

    it('should move a shortcut reminder with the due time when the due time changes', async () => {
      const requests = answerUpdate(() => HttpResponse.json(TEST_TASK));
      answerClientDeals({ items: [], hasMore: false });
      const user = userEvent.setup();
      renderEdit();

      await screen.findByLabelText('Due time');
      setInput('Due time', '18:30');
      await user.click(screen.getByRole('button', { name: 'Save changes' }));

      await waitFor(() => {
        expect(requests).toHaveLength(1);
      });
      const dueAt = localInstant(
        screen.getByLabelText<HTMLInputElement>('Due date').value,
        '18:30',
      );
      expect(await requests[0]?.json()).toEqual({
        dueAt,
        remindAt: new Date(Date.parse(dueAt) - HOUR_MS).toISOString(),
      });
    });

    it('should hint when the reminder was sent', async () => {
      renderEdit({ ...TEST_TASK, reminderSentAt: '2099-10-15T11:00:01.000Z', related: null });

      expect(await screen.findByRole('combobox', { name: 'Reminder' })).toHaveAccessibleDescription(
        /^Sent /,
      );
    });

    it('should say the task no longer exists when the save answers 404', async () => {
      answerUpdate(() => problemResponse(404, 'TASK_NOT_FOUND'));
      answerClientDeals({ items: [], hasMore: false });
      const user = userEvent.setup();
      renderEdit();

      await user.type(await screen.findByLabelText('Title'), '!');
      await user.click(screen.getByRole('button', { name: 'Save changes' }));

      expect(await screen.findByRole('alert')).toHaveTextContent('This task no longer exists.');
      expect(screen.getByRole('link', { name: 'Back to tasks' })).toHaveAttribute('href', '/tasks');
    });

    it('should show the not found state when the task is gone', async () => {
      recordRequests('get', `/api/tasks/${TEST_TASK.id}`, () =>
        problemResponse(404, 'TASK_NOT_FOUND'),
      );

      renderWithProviders(<EditTaskForm id={TEST_TASK.id} />);

      expect(await screen.findByRole('heading', { name: 'Task not found' })).toBeInTheDocument();
    });
  });
});
