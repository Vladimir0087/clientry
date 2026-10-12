import type { Response } from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, onTestFinished } from 'vitest';

import { apiProblemSchema } from '@clientry/shared/common';
import { taskListResponseSchema } from '@clientry/shared/tasks';
import type { TaskListResponse } from '@clientry/shared/tasks';

import { createTestApp } from '../../../test/create-test-app.js';
import type { TestApp } from '../../../test/create-test-app.js';
import { addManager, registerAccount } from '../../../test/fixtures/accounts.js';
import type { TestAccount } from '../../../test/fixtures/accounts.js';
import { insertClients } from '../../../test/fixtures/clients.js';
import { findStageIds, insertDeals } from '../../../test/fixtures/deals.js';
import { insertTasks } from '../../../test/fixtures/tasks.js';
import type { TaskSeed } from '../../../test/fixtures/tasks.js';
import { resetDatabase } from '../../../test/reset-database.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { positionsAfter } from '../deals/deal-position.js';

function at(day: number, hour = 12): Date {
  return new Date(Date.UTC(2030, 2, day, hour));
}

function parseList(response: Response): TaskListResponse {
  expect(response.status).toBe(200);
  return taskListResponseSchema.parse(response.body);
}

describe('tasks list API', () => {
  let testApp: TestApp;
  let prisma: PrismaService;
  let owner: TestAccount;
  let manager: TestAccount;
  let stranger: TestAccount;
  let workspaceId: string;
  let ownerId: string;
  let clientId: string;
  let otherClientId: string;
  let dealIds: string[];

  async function list(query = '', account = owner): Promise<TaskListResponse> {
    return parseList(await account.http.get(`/api/tasks${query}`));
  }

  async function titles(query = '', account = owner): Promise<string[]> {
    return (await list(query, account)).items.map(({ title }) => title);
  }

  function seed(fields: Partial<TaskSeed> & Pick<TaskSeed, 'title'>): TaskSeed {
    return { createdById: ownerId, dueAt: at(15), ...fields };
  }

  beforeAll(async () => {
    testApp = await createTestApp();
    prisma = testApp.app.get(PrismaService);
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
    owner = await registerAccount(testApp, 'Pixel Studio');
    stranger = await registerAccount(testApp, 'Other Studio');
    workspaceId = owner.session.workspace.id;
    ownerId = owner.session.user.id;
    manager = await addManager(testApp, workspaceId);
    [clientId = '', otherClientId = ''] = await insertClients(testApp, workspaceId, [
      { name: 'Romashka LLC', createdById: ownerId },
      { name: 'Lutik', createdById: ownerId },
    ]);
    const stages = await findStageIds(testApp, workspaceId);
    const positions = positionsAfter(null, 3);
    dealIds = await insertDeals(
      testApp,
      workspaceId,
      positions.map((position, index) => ({
        clientId: index < 2 ? clientId : otherClientId,
        stageId: stages.New,
        createdById: ownerId,
        title: `Deal ${String(index)}`,
        position,
      })),
    );
  });

  afterAll(async () => {
    await testApp.app.close();
  });

  describe('order', () => {
    it('should list open tasks by due time with ids breaking ties when no status is given', async () => {
      const [, tieFirst = '', tieSecond = ''] = await insertTasks(testApp, workspaceId, [
        seed({ title: 'Later', dueAt: at(20) }),
        seed({ title: 'Tie A', dueAt: at(10) }),
        seed({ title: 'Tie B', dueAt: at(10) }),
        seed({ title: 'Earliest', dueAt: at(5) }),
        seed({ title: 'Done', dueAt: at(1), doneAt: at(2) }),
        seed({ title: 'Deleted', dueAt: at(1), deletedAt: at(2) }),
      ]);
      const ties = [tieFirst, tieSecond]
        .toSorted()
        .map((id) => (id === tieFirst ? 'Tie A' : 'Tie B'));

      expect(await titles()).toEqual(['Earliest', ...ties, 'Later']);
    });

    it('should list done tasks by completion, newest first, when status is done', async () => {
      await insertTasks(testApp, workspaceId, [
        seed({ title: 'Done first', doneAt: at(1) }),
        seed({ title: 'Done last', doneAt: at(9) }),
        seed({ title: 'Same time, later due', doneAt: at(5), dueAt: at(20) }),
        seed({ title: 'Same time, earlier due', doneAt: at(5), dueAt: at(10) }),
        seed({ title: 'Open' }),
      ]);

      expect(await titles('?status=done')).toEqual([
        'Done last',
        'Same time, later due',
        'Same time, earlier due',
        'Done first',
      ]);
    });
  });

  describe('filters', () => {
    beforeEach(async () => {
      await insertTasks(testApp, workspaceId, [
        seed({ title: 'For owner', dueAt: at(1) }),
        seed({ title: 'Owner for manager', assigneeId: manager.session.user.id, dueAt: at(2) }),
        seed({
          title: 'Manager for owner',
          createdById: manager.session.user.id,
          assigneeId: ownerId,
          dueAt: at(3),
        }),
        seed({ title: 'Client task', clientId, dueAt: at(4) }),
        seed({ title: 'Deal task', dealId: dealIds[0], dueAt: at(5) }),
        seed({ title: 'Other deal task', dealId: dealIds[1], dueAt: at(6) }),
        seed({ title: 'Other client deal task', dealId: dealIds[2], dueAt: at(7) }),
      ]);
    });

    it('should keep the tasks assigned to the owner, whoever created them, when only mine is asked', async () => {
      expect(await titles('?assignee=me')).toEqual([
        'For owner',
        'Manager for owner',
        'Client task',
        'Deal task',
        'Other deal task',
        'Other client deal task',
      ]);
    });

    it('should keep only the tasks assigned to the manager when a manager asks for only mine', async () => {
      expect(await titles('?assignee=me', manager)).toEqual(['Owner for manager']);
    });

    it("should list the client's tasks and its deals' tasks when clientId is given", async () => {
      expect(await titles(`?clientId=${clientId}`)).toEqual([
        'Client task',
        'Deal task',
        'Other deal task',
      ]);
    });

    it("should leave out a deleted deal's tasks when clientId is given", async () => {
      await prisma.deal.update({ where: { id: dealIds[1] }, data: { deletedAt: new Date() } });

      expect(await titles(`?clientId=${clientId}`)).toEqual(['Client task', 'Deal task']);
    });

    it("should list only the deal's tasks when dealId is given", async () => {
      expect(await titles(`?dealId=${dealIds[0] ?? ''}`)).toEqual(['Deal task']);
    });

    it.each([
      ['client', (): string => `clientId=${clientId}`],
      ['deal', (): string => `dealId=${dealIds[0] ?? ''}`],
    ])('should answer an empty list when the %s is in another workspace', async (_case, query) => {
      await insertTasks(testApp, stranger.session.workspace.id, [
        { title: 'Stranger task', createdById: stranger.session.user.id, dueAt: at(1) },
      ]);

      expect(await titles(`?${query()}`, stranger)).toEqual([]);
    });

    it('should answer an empty list when the deal is deleted', async () => {
      await prisma.deal.update({ where: { id: dealIds[0] }, data: { deletedAt: new Date() } });

      expect(await titles(`?dealId=${dealIds[0] ?? ''}`)).toEqual([]);
    });

    it('should answer an empty list when the client is deleted', async () => {
      await prisma.client.update({ where: { id: clientId }, data: { deletedAt: new Date() } });

      expect(await titles(`?clientId=${clientId}`)).toEqual([]);
    });

    it('should hide every task of a deleted client from the list when the client is deleted', async () => {
      await prisma.client.update({ where: { id: clientId }, data: { deletedAt: new Date() } });

      expect(await titles()).toEqual([
        'For owner',
        'Owner for manager',
        'Manager for owner',
        'Other client deal task',
      ]);
    });

    it('should list nothing of another workspace when a stranger lists tasks', async () => {
      expect(await titles('', stranger)).toEqual([]);
    });

    it('should answer 400 on dealId when clientId and dealId are both given', async () => {
      const response = await owner.http.get(
        `/api/tasks?clientId=${clientId}&dealId=${dealIds[0] ?? ''}`,
      );

      expect(response.status).toBe(400);
      expect(apiProblemSchema.parse(response.body).errors).toEqual([
        { path: 'dealId', message: 'Use clientId or dealId, not both' },
      ]);
    });
  });

  describe('pages', () => {
    it.each(['open', 'done'] as const)(
      'should return each of 60 %s tasks once over three pages when the cursor is followed to the end',
      async (status) => {
        await insertTasks(
          testApp,
          workspaceId,
          Array.from({ length: 60 }, (_, index) =>
            seed({
              title: `Task ${String(index)}`,
              dueAt: at(1 + (index % 7)),
              doneAt: status === 'done' ? at(1 + (index % 3)) : undefined,
            }),
          ),
        );
        const seen: string[] = [];
        const cursors: (string | null)[] = [];
        let cursor: string | null = null;

        do {
          const query: string = cursor === null ? '' : `&cursor=${cursor}`;
          const page: TaskListResponse = await list(`?status=${status}${query}`);
          seen.push(...page.items.map(({ id }) => id));
          cursor = page.nextCursor;
          cursors.push(cursor);
        } while (cursor !== null);

        expect(seen).toHaveLength(60);
        expect(new Set(seen).size).toBe(60);
        expect(cursors).toHaveLength(3);
        expect(cursors.at(-1)).toBeNull();
      },
    );

    it('should answer 400 on cursor when it was made for the other status', async () => {
      await insertTasks(testApp, workspaceId, [seed({ title: 'One' }), seed({ title: 'Two' })]);
      const { nextCursor } = await list('?limit=1');

      const response = await owner.http.get(`/api/tasks?status=done&cursor=${nextCursor ?? ''}`);

      expect(response.status).toBe(400);
      expect(apiProblemSchema.parse(response.body).errors).toEqual([
        { path: 'cursor', message: 'Invalid cursor' },
      ]);
    });

    it('should answer 400 on limit when it is 101', async () => {
      const response = await owner.http.get('/api/tasks?limit=101');

      expect(response.status).toBe(400);
    });
  });

  describe('query count', () => {
    it('should issue as many SQL statements as for one task when 25 tasks carry every link kind', async () => {
      const assignees = [ownerId, manager.session.user.id];
      await insertTasks(testApp, workspaceId, [seed({ title: 'First', dueAt: at(1) })]);
      const statements: string[] = [];
      // Prisma has no way to remove a listener, so it stops recording when the test ends.
      let isRecording = true;
      onTestFinished(() => {
        isRecording = false;
      });
      prisma.$on('query', (event) => {
        if (isRecording) {
          statements.push(event.query);
        }
      });

      await list();
      const taskStatements = statements.filter((query) => query.includes('tasks'));
      const forOne = statements.splice(0).length;
      await insertTasks(
        testApp,
        workspaceId,
        Array.from({ length: 24 }, (_, index) =>
          seed({
            title: `Task ${String(index)}`,
            dueAt: at(2 + index),
            assigneeId: assignees[index % assignees.length],
            clientId: index % 3 === 0 ? clientId : undefined,
            dealId: index % 3 === 1 ? dealIds[index % dealIds.length] : undefined,
          }),
        ),
      );
      statements.splice(0);
      const page = await list();
      const forPage = statements.splice(0).length;

      expect(page.items).toHaveLength(25);
      expect(forPage).toBe(forOne);
      expect(taskStatements).toHaveLength(1);
    });
  });
});
