import { agent } from 'supertest';
import type { Agent, Response, Test } from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { Client } from '@clientry/shared/clients';
import { apiProblemSchema } from '@clientry/shared/common';
import type { Deal } from '@clientry/shared/deals';
import { taskSchema } from '@clientry/shared/tasks';
import type { CreateTaskRequest, Task } from '@clientry/shared/tasks';

import { TasksRepository } from './tasks.repository.js';
import { createTestApp } from '../../../test/create-test-app.js';
import type { TestApp } from '../../../test/create-test-app.js';
import { addManager, registerAccount } from '../../../test/fixtures/accounts.js';
import type { TestAccount } from '../../../test/fixtures/accounts.js';
import { createClient } from '../../../test/fixtures/clients.js';
import { createDeal, findStageIds } from '../../../test/fixtures/deals.js';
import { createTask } from '../../../test/fixtures/tasks.js';
import { resetDatabase } from '../../../test/reset-database.js';
import { holdTransaction, waitForLockWaiter } from '../../../test/support/held-transaction.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';

const UNKNOWN_ID = '0199c2a1-4b5c-7d6e-8f9a-0b1c2d3e4f5a';
const HOUR_MS = 60 * 60_000;
// Whole hours a year ahead: a reminder must lie in the future and outside the queue horizon.
const BASE_MS = Math.floor(Date.now() / HOUR_MS) * HOUR_MS + 365 * 24 * HOUR_MS;

function hoursAhead(hours: number): string {
  return new Date(BASE_MS + hours * HOUR_MS).toISOString();
}

function withoutMilliseconds(instant: string): string {
  return instant.replace('.000Z', 'Z');
}

const DUE_AT = hoursAhead(6);
const REMIND_AT = hoursAhead(0);

function problemCode(response: Response): string {
  return apiProblemSchema.parse(response.body).code;
}

function errorPaths(response: Response): string[] {
  return (apiProblemSchema.parse(response.body).errors ?? []).map(({ path }) => path);
}

type ReferenceCase = readonly [
  reference: string,
  path: string,
  message: string,
  body: () => Promise<Partial<CreateTaskRequest>>,
];

async function expectTaskNotFound(request: Test): Promise<void> {
  const response = await request;
  expect(response.status).toBe(404);
  expect(problemCode(response)).toBe('TASK_NOT_FOUND');
}

describe('tasks API', () => {
  let testApp: TestApp;
  let prisma: PrismaService;
  let owner: TestAccount;
  let manager: TestAccount;
  let stranger: TestAccount;
  let client: Client;
  let deal: Deal;

  function send(): Agent {
    return agent(testApp.app.getHttpServer());
  }

  function taskBody(overrides: Partial<CreateTaskRequest> = {}): CreateTaskRequest {
    return {
      title: 'Call Romashka',
      dueAt: DUE_AT,
      remindAt: REMIND_AT,
      assigneeId: owner.session.user.id,
      ...overrides,
    };
  }

  async function storedTask(id: string): Promise<Record<string, unknown> | null> {
    return prisma.task.findUnique({ where: { id } });
  }

  async function createOwnerDeal(account: TestAccount, clientId: string): Promise<Deal> {
    const stages = await findStageIds(testApp, account.session.workspace.id);
    return createDeal(account.http, {
      title: 'Landing page',
      clientId,
      stageId: stages.New,
      amount: 150_000,
      currency: 'USD',
      assigneeId: account.session.user.id,
    });
  }

  // Each hides a task linked as given by deleting what the path names.
  const HIDES = [
    ['its client is deleted', 'client', (): string => `/api/clients/${client.id}`],
    ['its deal is deleted', 'deal', (): string => `/api/deals/${deal.id}`],
    ['the client of its deal is deleted', 'deal', (): string => `/api/clients/${client.id}`],
  ] as const;

  function linkTo(kind: 'client' | 'deal'): CreateTaskRequest['related'] {
    return kind === 'client' ? { kind, id: client.id } : { kind, id: deal.id };
  }

  const FOREIGN_REFERENCES: readonly ReferenceCase[] = [
    [
      'a member of another workspace',
      'assigneeId',
      'Choose a member',
      () => Promise.resolve({ assigneeId: stranger.session.user.id }),
    ],
    [
      'a client of another workspace',
      'related.id',
      'Choose a client',
      async () => ({ related: { kind: 'client', id: (await createClient(stranger.http)).id } }),
    ],
    [
      'a deal of another workspace',
      'related.id',
      'Choose a deal',
      async () => {
        const foreignClient = await createClient(stranger.http);
        const foreign = await createOwnerDeal(stranger, foreignClient.id);
        return { related: { kind: 'deal', id: foreign.id } };
      },
    ],
  ];

  const UNUSABLE_REFERENCES: readonly ReferenceCase[] = [
    ...FOREIGN_REFERENCES,
    [
      'a deleted client',
      'related.id',
      'Choose a client',
      async () => {
        const gone = await createClient(owner.http, { name: 'Gone' });
        await owner.http.delete(`/api/clients/${gone.id}`).expect(204);
        return { related: { kind: 'client', id: gone.id } };
      },
    ],
    [
      'a deleted deal',
      'related.id',
      'Choose a deal',
      async () => {
        await owner.http.delete(`/api/deals/${deal.id}`).expect(204);
        return { related: { kind: 'deal', id: deal.id } };
      },
    ],
    [
      'a deal of a deleted client',
      'related.id',
      'Choose a deal',
      async () => {
        await owner.http.delete(`/api/clients/${client.id}`).expect(204);
        return { related: { kind: 'deal', id: deal.id } };
      },
    ],
    // The API never links a deal across workspaces; only a direct write can.
    [
      'a deal whose client belongs to another workspace',
      'related.id',
      'Choose a deal',
      async () => {
        const foreignClient = await createClient(stranger.http);
        await prisma.deal.update({ where: { id: deal.id }, data: { clientId: foreignClient.id } });
        return { related: { kind: 'deal', id: deal.id } };
      },
    ],
  ];

  beforeAll(async () => {
    testApp = await createTestApp();
    prisma = testApp.app.get(PrismaService);
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
    owner = await registerAccount(testApp, 'Pixel Studio');
    stranger = await registerAccount(testApp, 'Other Studio');
    manager = await addManager(testApp, owner.session.workspace.id);
    client = await createClient(owner.http, { name: 'Romashka LLC' });
    deal = await createOwnerDeal(owner, client.id);
  });

  afterAll(async () => {
    await testApp.app.close();
  });

  describe('create', () => {
    it('should answer 201 with the task and its names when the input is valid', async () => {
      const response = await manager.http.post('/api/tasks').send(taskBody());

      expect(response.status).toBe(201);
      expect(taskSchema.parse(response.body)).toMatchObject({
        title: 'Call Romashka',
        dueAt: DUE_AT,
        remindAt: REMIND_AT,
        reminderSentAt: null,
        doneAt: null,
        assignee: { id: owner.session.user.id, name: 'Ann' },
        createdBy: { id: manager.session.user.id, name: 'Max' },
        related: null,
      });
    });

    it('should link the client with its name when related is a client', async () => {
      const task = await createTask(
        owner.http,
        taskBody({ related: { kind: 'client', id: client.id } }),
      );

      expect(task.related).toEqual({ kind: 'client', id: client.id, name: 'Romashka LLC' });
    });

    it('should link the deal with its current client when related is a deal', async () => {
      const task = await createTask(
        owner.http,
        taskBody({ related: { kind: 'deal', id: deal.id } }),
      );

      expect(task.related).toEqual({
        kind: 'deal',
        id: deal.id,
        title: 'Landing page',
        client: { id: client.id, name: 'Romashka LLC' },
      });
      expect(await storedTask(task.id)).toMatchObject({ dealId: deal.id, clientId: null });
    });

    it('should store whole milliseconds when the times come without them', async () => {
      const task = await createTask(
        owner.http,
        taskBody({ dueAt: withoutMilliseconds(DUE_AT), remindAt: withoutMilliseconds(REMIND_AT) }),
      );

      expect([task.dueAt, task.remindAt]).toEqual([DUE_AT, REMIND_AT]);
    });

    it.each(UNUSABLE_REFERENCES)(
      'should answer 400 and write nothing when the body has %s',
      async (_reference, path, message, body) => {
        const overrides = await body();

        const response = await owner.http.post('/api/tasks').send(taskBody(overrides));

        expect(response.status).toBe(400);
        expect(apiProblemSchema.parse(response.body).errors).toEqual([{ path, message }]);
        expect(await prisma.task.count()).toBe(0);
      },
    );

    it('should answer 400 on remindAt and write nothing when the reminder is in the past', async () => {
      const response = await owner.http
        .post('/api/tasks')
        .send(taskBody({ remindAt: '2020-01-01T00:00:00.000Z' }));

      expect(response.status).toBe(400);
      expect(apiProblemSchema.parse(response.body).errors).toEqual([
        { path: 'remindAt', message: 'Choose a time in the future' },
      ]);
      expect(await prisma.task.count()).toBe(0);
    });

    it('should accept a past due time when the task has no reminder', async () => {
      const task = await createTask(
        owner.http,
        taskBody({ dueAt: '2020-01-01T00:00:00.000Z', remindAt: null }),
      );

      expect(task.remindAt).toBeNull();
    });

    it('should ignore workspaceId, createdById, doneAt and reminderSentAt when the body has them', async () => {
      const response = await owner.http.post('/api/tasks').send({
        ...taskBody(),
        workspaceId: stranger.session.workspace.id,
        createdById: stranger.session.user.id,
        doneAt: DUE_AT,
        reminderSentAt: DUE_AT,
      });

      const task = taskSchema.parse(response.body);
      expect(await storedTask(task.id)).toMatchObject({
        workspaceId: owner.session.workspace.id,
        createdById: owner.session.user.id,
        doneAt: null,
        reminderSentAt: null,
      });
    });

    it('should hold a deal delete back when a task transaction has read the deal', async () => {
      const tasks = testApp.app.get(TasksRepository);

      const write = tasks.inTransaction(async (tx) => {
        await tx.findDeal(owner.session.workspace.id, deal.id);
        await prisma.$transaction(async (other) => {
          await other.$executeRaw`SET LOCAL lock_timeout = '200ms'`;
          await other.deal.update({ where: { id: deal.id }, data: { deletedAt: new Date() } });
        });
      });

      await expect(write).rejects.toThrow(/lock timeout/);
      expect((await prisma.deal.findUnique({ where: { id: deal.id } }))?.deletedAt).toBeNull();
    });
  });

  describe('get', () => {
    it('should answer 200 with the task when another member of the workspace reads it', async () => {
      const task = await createTask(owner.http, taskBody());

      const response = await manager.http.get(`/api/tasks/${task.id}`);

      expect(response.status).toBe(200);
      expect(response.body).toEqual(task);
    });

    it('should answer 404 TASK_NOT_FOUND when the task is in another workspace', async () => {
      const task = await createTask(owner.http, taskBody());

      await expectTaskNotFound(stranger.http.get(`/api/tasks/${task.id}`));
    });

    it('should answer 404 when the task is deleted', async () => {
      const task = await createTask(owner.http, taskBody());
      await owner.http.delete(`/api/tasks/${task.id}`).expect(204);

      await expectTaskNotFound(owner.http.get(`/api/tasks/${task.id}`));
    });

    it.each(HIDES)(
      'should answer 404 and bring the task back on restore when %s',
      async (_case, kind, path) => {
        const task = await createTask(owner.http, taskBody({ related: linkTo(kind) }));
        await owner.http.delete(path()).expect(204);

        await expectTaskNotFound(owner.http.get(`/api/tasks/${task.id}`));
        await owner.http.post(`${path()}/restore`).expect(200);
        const response = await owner.http.get(`/api/tasks/${task.id}`).expect(200);
        expect(response.body).toEqual(task);
      },
    );

    it('should answer 400 on id when the id is not a UUID', async () => {
      const response = await owner.http.get('/api/tasks/not-a-uuid');

      expect(response.status).toBe(400);
      expect(errorPaths(response)).toEqual(['id']);
    });
  });

  describe('edit', () => {
    let task: Task;

    beforeEach(async () => {
      task = await createTask(owner.http, taskBody({ related: { kind: 'client', id: client.id } }));
    });

    it('should change only the sent fields when an assignee who did not create it edits', async () => {
      await owner.http
        .patch(`/api/tasks/${task.id}`)
        .send({ assigneeId: manager.session.user.id })
        .expect(200);

      const response = await manager.http
        .patch(`/api/tasks/${task.id}`)
        .send({ title: 'Call back', related: { kind: 'deal', id: deal.id } });

      expect(response.status).toBe(200);
      expect(taskSchema.parse(response.body)).toMatchObject({
        title: 'Call back',
        dueAt: DUE_AT,
        remindAt: REMIND_AT,
        assignee: { id: manager.session.user.id, name: 'Max' },
        related: { kind: 'deal', id: deal.id },
      });
      expect(await storedTask(task.id)).toMatchObject({ clientId: null, dealId: deal.id });
    });

    it('should answer 200 and keep updated_at when the values are the stored ones', async () => {
      const response = await owner.http.patch(`/api/tasks/${task.id}`).send({
        title: task.title,
        dueAt: withoutMilliseconds(DUE_AT),
        remindAt: REMIND_AT,
        assigneeId: owner.session.user.id,
        related: { kind: 'client', id: client.id },
      });

      expect(response.status).toBe(200);
      expect(response.body).toEqual(task);
    });

    it('should clear reminder_sent_at when remindAt changes', async () => {
      await prisma.task.update({ where: { id: task.id }, data: { reminderSentAt: new Date() } });

      const response = await owner.http
        .patch(`/api/tasks/${task.id}`)
        .send({ remindAt: hoursAhead(1) })
        .expect(200);

      expect(taskSchema.parse(response.body).reminderSentAt).toBeNull();
    });

    it('should keep reminder_sent_at when only the due time changes', async () => {
      const sentAt = new Date(Date.parse(REMIND_AT) + 1000);
      await prisma.task.update({ where: { id: task.id }, data: { reminderSentAt: sentAt } });

      const response = await owner.http
        .patch(`/api/tasks/${task.id}`)
        .send({ dueAt: hoursAhead(30) })
        .expect(200);

      expect(taskSchema.parse(response.body).reminderSentAt).toBe(sentAt.toISOString());
    });

    it('should answer 200 when an unchanged past reminder is sent with another change', async () => {
      const past = new Date('2020-01-01T00:00:00.000Z');
      await prisma.task.update({ where: { id: task.id }, data: { remindAt: past } });

      await owner.http
        .patch(`/api/tasks/${task.id}`)
        .send({ title: 'Call back', remindAt: past.toISOString() })
        .expect(200);
    });

    it('should answer 400 on related.id and keep the row when the new deal is deleted', async () => {
      await owner.http.delete(`/api/deals/${deal.id}`).expect(204);
      const before = await storedTask(task.id);

      const response = await owner.http
        .patch(`/api/tasks/${task.id}`)
        .send({ related: { kind: 'deal', id: deal.id } });

      expect(response.status).toBe(400);
      expect(apiProblemSchema.parse(response.body).errors).toEqual([
        { path: 'related.id', message: 'Choose a deal' },
      ]);
      expect(await storedTask(task.id)).toEqual(before);
    });

    it.each(FOREIGN_REFERENCES)(
      'should answer 400 and keep the row when the edit sends %s',
      async (_reference, path, message, body) => {
        const overrides = await body();
        const before = await storedTask(task.id);

        const response = await owner.http.patch(`/api/tasks/${task.id}`).send(overrides);

        expect(response.status).toBe(400);
        expect(apiProblemSchema.parse(response.body).errors).toEqual([{ path, message }]);
        expect(await storedTask(task.id)).toEqual(before);
      },
    );

    it('should answer 400 on remindAt and keep the row when the reminder moves to the past', async () => {
      const before = await storedTask(task.id);

      const response = await owner.http
        .patch(`/api/tasks/${task.id}`)
        .send({ remindAt: '2020-01-01T00:00:00.000Z' });

      expect(response.status).toBe(400);
      expect(apiProblemSchema.parse(response.body).errors).toEqual([
        { path: 'remindAt', message: 'Choose a time in the future' },
      ]);
      expect(await storedTask(task.id)).toEqual(before);
    });

    it('should remove the link and the reminder when both are sent as null', async () => {
      const response = await owner.http
        .patch(`/api/tasks/${task.id}`)
        .send({ related: null, remindAt: null })
        .expect(200);

      expect(taskSchema.parse(response.body)).toMatchObject({ related: null, remindAt: null });
    });

    it('should answer 404 TASK_NOT_FOUND and keep the row when the task is in another workspace', async () => {
      await expectTaskNotFound(
        stranger.http.patch(`/api/tasks/${task.id}`).send({ title: 'Hijacked' }),
      );
      expect(await storedTask(task.id)).toMatchObject({ title: 'Call Romashka' });
    });
  });

  describe('complete and reopen', () => {
    it('should set done_at and keep it when the task is completed twice', async () => {
      const task = await createTask(owner.http, taskBody());

      const first = await manager.http.post(`/api/tasks/${task.id}/complete`).expect(200);
      const second = await manager.http.post(`/api/tasks/${task.id}/complete`).expect(200);

      const { doneAt } = taskSchema.parse(first.body);
      expect(doneAt).not.toBeNull();
      expect(taskSchema.parse(second.body).doneAt).toBe(doneAt);
    });

    it('should clear done_at and answer 200 again when the task is reopened twice', async () => {
      const task = await createTask(owner.http, taskBody());
      await owner.http.post(`/api/tasks/${task.id}/complete`).expect(200);

      await owner.http.post(`/api/tasks/${task.id}/reopen`).expect(200);
      const response = await owner.http.post(`/api/tasks/${task.id}/reopen`).expect(200);

      expect(taskSchema.parse(response.body).doneAt).toBeNull();
      expect(await storedTask(task.id)).toMatchObject({ doneAt: null });
    });

    it.each(['complete', 'reopen'])(
      'should answer 404 when %s meets a task of another workspace',
      async (action) => {
        const task = await createTask(owner.http, taskBody());

        await expectTaskNotFound(stranger.http.post(`/api/tasks/${task.id}/${action}`));
      },
    );
  });

  describe('deleted and hidden tasks', () => {
    const WRITES = [
      ['patch', ''],
      ['post', '/complete'],
      ['post', '/reopen'],
    ] as const;

    it.each(WRITES)(
      'should answer 404 and keep the row when %s %s meets a deleted task',
      async (method, suffix) => {
        const task = await createTask(owner.http, taskBody());
        await owner.http.delete(`/api/tasks/${task.id}`).expect(204);
        const stored = await storedTask(task.id);

        await expectTaskNotFound(
          owner.http[method](`/api/tasks/${task.id}${suffix}`).send({ title: 'Shop' }),
        );

        expect(await storedTask(task.id)).toEqual(stored);
      },
    );

    const HIDDEN_WRITES = [...WRITES, ['delete', '']] as const;

    it.each(
      HIDDEN_WRITES.flatMap(([method, suffix]) =>
        HIDES.map(([hide, kind, path]) => [method, suffix, hide, kind, path] as const),
      ),
    )(
      'should answer 404 and keep the row when %s %s meets a task whose %s',
      async (method, suffix, _hide, kind, path) => {
        const task = await createTask(owner.http, taskBody({ related: linkTo(kind) }));
        await owner.http.delete(path()).expect(204);
        const stored = await storedTask(task.id);

        await expectTaskNotFound(
          owner.http[method](`/api/tasks/${task.id}${suffix}`).send({ title: 'Shop' }),
        );

        expect(await storedTask(task.id)).toEqual(stored);
      },
    );
  });

  describe('delete and restore', () => {
    it('should answer 204 and hide the task when the owner deletes a manager task', async () => {
      const task = await createTask(manager.http, taskBody());

      await owner.http.delete(`/api/tasks/${task.id}`).expect(204);

      expect((await storedTask(task.id))?.deletedAt).toBeInstanceOf(Date);
    });

    it('should answer 204 when a manager deletes their own task', async () => {
      const task = await createTask(manager.http, taskBody());

      await manager.http.delete(`/api/tasks/${task.id}`).expect(204);
    });

    it('should answer 403 TASK_DELETE_FORBIDDEN and keep the row when a manager deletes a task assigned to them', async () => {
      const task = await createTask(owner.http, taskBody({ assigneeId: manager.session.user.id }));

      const response = await manager.http.delete(`/api/tasks/${task.id}`);

      expect(response.status).toBe(403);
      expect(problemCode(response)).toBe('TASK_DELETE_FORBIDDEN');
      expect((await storedTask(task.id))?.deletedAt).toBeNull();
    });

    it('should answer 404 when the task is deleted again', async () => {
      const task = await createTask(owner.http, taskBody());
      await owner.http.delete(`/api/tasks/${task.id}`).expect(204);

      await expectTaskNotFound(owner.http.delete(`/api/tasks/${task.id}`));
    });

    it('should answer 404 and keep the row when the task is in another workspace', async () => {
      const task = await createTask(owner.http, taskBody());

      await expectTaskNotFound(stranger.http.delete(`/api/tasks/${task.id}`));
      expect((await storedTask(task.id))?.deletedAt).toBeNull();
    });

    it('should answer 200 with the task when a deleted task is restored', async () => {
      const task = await createTask(owner.http, taskBody());
      await owner.http.delete(`/api/tasks/${task.id}`).expect(204);

      const response = await owner.http.post(`/api/tasks/${task.id}/restore`);

      expect(response.status).toBe(200);
      expect(taskSchema.parse(response.body)).toMatchObject({ id: task.id, title: task.title });
      await owner.http.get(`/api/tasks/${task.id}`).expect(200);
    });

    it('should answer 200 with the task unchanged when it is active', async () => {
      const task = await createTask(owner.http, taskBody());

      const response = await owner.http.post(`/api/tasks/${task.id}/restore`);

      expect(response.status).toBe(200);
      expect(response.body).toEqual(task);
    });

    it('should answer 403 and keep the task deleted when a manager restores the owner task', async () => {
      const task = await createTask(owner.http, taskBody());
      await owner.http.delete(`/api/tasks/${task.id}`).expect(204);

      const response = await manager.http.post(`/api/tasks/${task.id}/restore`);

      expect(response.status).toBe(403);
      expect(problemCode(response)).toBe('TASK_DELETE_FORBIDDEN');
      expect((await storedTask(task.id))?.deletedAt).toBeInstanceOf(Date);
    });

    it('should answer 404 when the task is in another workspace', async () => {
      const task = await createTask(owner.http, taskBody());
      await owner.http.delete(`/api/tasks/${task.id}`).expect(204);

      await expectTaskNotFound(stranger.http.post(`/api/tasks/${task.id}/restore`));
      expect((await storedTask(task.id))?.deletedAt).toBeInstanceOf(Date);
    });

    it.each(HIDES)(
      'should answer 404 and keep the task deleted when it is restored after %s',
      async (_hide, kind, path) => {
        const task = await createTask(owner.http, taskBody({ related: linkTo(kind) }));
        await owner.http.delete(`/api/tasks/${task.id}`).expect(204);
        await owner.http.delete(path()).expect(204);

        await expectTaskNotFound(owner.http.post(`/api/tasks/${task.id}/restore`));
        expect((await storedTask(task.id))?.deletedAt).toBeInstanceOf(Date);
      },
    );
  });

  describe('concurrent writes', () => {
    it('should complete the task when its assignee changes meanwhile', async () => {
      const task = await createTask(owner.http, taskBody());
      const reassign = await holdTransaction(prisma, (tx) =>
        tx.task.update({ where: { id: task.id }, data: { assigneeId: manager.session.user.id } }),
      );

      const completing = owner.http.post(`/api/tasks/${task.id}/complete`).then((r) => r);
      await waitForLockWaiter(prisma);
      await reassign.commit();
      const response = await completing;

      expect(response.status).toBe(200);
      const completed = taskSchema.parse(response.body);
      expect(completed.assignee.id).toBe(manager.session.user.id);
      expect(completed.doneAt).not.toBeNull();
    });

    it('should link the deal when its client changes meanwhile', async () => {
      const other = await createClient(owner.http, { name: 'Vasilek LLC' });
      const move = await holdTransaction(prisma, (tx) =>
        tx.deal.update({ where: { id: deal.id }, data: { clientId: other.id } }),
      );

      const creating = owner.http
        .post('/api/tasks')
        .send(taskBody({ related: { kind: 'deal', id: deal.id } }))
        .then((r) => r);
      await waitForLockWaiter(prisma);
      await move.commit();
      const response = await creating;

      expect(response.status).toBe(201);
      expect(taskSchema.parse(response.body).related).toMatchObject({
        kind: 'deal',
        client: { id: other.id, name: 'Vasilek LLC' },
      });
    });
  });

  describe('access', () => {
    it.each([
      ['get', '/api/tasks'],
      ['post', '/api/tasks'],
      ['get', `/api/tasks/${UNKNOWN_ID}`],
      ['patch', `/api/tasks/${UNKNOWN_ID}`],
      ['post', `/api/tasks/${UNKNOWN_ID}/complete`],
      ['post', `/api/tasks/${UNKNOWN_ID}/reopen`],
      ['delete', `/api/tasks/${UNKNOWN_ID}`],
      ['post', `/api/tasks/${UNKNOWN_ID}/restore`],
    ] as const)('should answer 401 when %s %s gets no access cookie', async (method, path) => {
      const response = await send()[method](path);

      expect(response.status).toBe(401);
      expect(problemCode(response)).toBe('AUTHENTICATION_REQUIRED');
    });

    it.each([
      ['post', '/api/tasks'],
      ['patch', `/api/tasks/${UNKNOWN_ID}`],
      ['post', `/api/tasks/${UNKNOWN_ID}/complete`],
      ['post', `/api/tasks/${UNKNOWN_ID}/reopen`],
      ['delete', `/api/tasks/${UNKNOWN_ID}`],
      ['post', `/api/tasks/${UNKNOWN_ID}/restore`],
    ] as const)(
      'should answer 403 UNTRUSTED_ORIGIN when %s %s comes from an untrusted origin',
      async (method, path) => {
        const response = await owner.http[method](path).set('Origin', 'https://evil.example');

        expect(response.status).toBe(403);
        expect(problemCode(response)).toBe('UNTRUSTED_ORIGIN');
      },
    );
  });

  describe('schema', () => {
    it('should give the task and notification references the delete rules of the data model when migrations ran', async () => {
      const rules = await prisma.$queryRaw<{ name: string; rule: string }[]>`
        SELECT constraint_name AS name, delete_rule AS rule
        FROM information_schema.referential_constraints
        WHERE constraint_name LIKE 'tasks\_%' OR constraint_name LIKE 'notifications\_%'
        ORDER BY constraint_name`;

      expect(rules).toEqual([
        { name: 'notifications_task_id_fkey', rule: 'NO ACTION' },
        { name: 'notifications_user_id_fkey', rule: 'RESTRICT' },
        { name: 'notifications_workspace_id_fkey', rule: 'CASCADE' },
        { name: 'tasks_assignee_id_fkey', rule: 'RESTRICT' },
        { name: 'tasks_client_id_fkey', rule: 'NO ACTION' },
        { name: 'tasks_created_by_id_fkey', rule: 'RESTRICT' },
        { name: 'tasks_deal_id_fkey', rule: 'NO ACTION' },
        { name: 'tasks_workspace_id_fkey', rule: 'CASCADE' },
      ]);
    });
  });
});
