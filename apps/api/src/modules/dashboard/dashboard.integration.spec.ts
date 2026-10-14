import { agent } from 'supertest';
import type { Response } from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { apiProblemSchema } from '@clientry/shared/common';
import {
  closedDealsResponseSchema,
  dashboardSummaryResponseSchema,
} from '@clientry/shared/dashboard';
import type { ClosedDeals, DashboardSummary } from '@clientry/shared/dashboard';

import { createTestApp } from '../../../test/create-test-app.js';
import type { TestApp } from '../../../test/create-test-app.js';
import { addManager, registerAccount } from '../../../test/fixtures/accounts.js';
import type { TestAccount } from '../../../test/fixtures/accounts.js';
import { insertClients } from '../../../test/fixtures/clients.js';
import { createDeal, findStageIds, insertDeals, moveDeal } from '../../../test/fixtures/deals.js';
import type { DealSeed, StageIds } from '../../../test/fixtures/deals.js';
import { insertTasks } from '../../../test/fixtures/tasks.js';
import type { TaskSeed } from '../../../test/fixtures/tasks.js';
import { resetDatabase } from '../../../test/reset-database.js';
import { recordStatements } from '../../../test/support/statements.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { positionsAfter } from '../deals/deal-position.js';

const HOUR_MS = 3_600_000;

// Seven UTC month starts of 2030: six periods, January to June.
const BOUNDS = Array.from({ length: 7 }, (_, month) => new Date(Date.UTC(2030, month, 1)));

function boundsQuery(bounds: readonly Date[]): string {
  return bounds.map((bound) => `bounds=${encodeURIComponent(bound.toISOString())}`).join('&');
}

function parseSummary(response: Response): DashboardSummary {
  expect(response.status).toBe(200);
  return dashboardSummaryResponseSchema.parse(response.body);
}

function parseClosed(response: Response): ClosedDeals {
  expect(response.status).toBe(200);
  return closedDealsResponseSchema.parse(response.body);
}

describe('dashboard API', () => {
  let testApp: TestApp;
  let prisma: PrismaService;
  let owner: TestAccount;
  let manager: TestAccount;
  let stranger: TestAccount;
  let workspaceId: string;
  let ownerId: string;
  let stages: StageIds;
  let clientId: string;
  let deletedClientId: string;
  let positions: string[];

  async function summary(account = owner): Promise<DashboardSummary> {
    return parseSummary(await account.http.get('/api/dashboard/summary'));
  }

  async function closed(bounds = BOUNDS, account = owner): Promise<ClosedDeals> {
    return parseClosed(
      await account.http.get(`/api/dashboard/closed-deals?${boundsQuery(bounds)}`),
    );
  }

  function deal(fields: Partial<DealSeed> & Pick<DealSeed, 'stageId'>): DealSeed {
    const position = positions.shift() ?? '';
    return { clientId, createdById: ownerId, position, ...fields };
  }

  function task(fields: Partial<TaskSeed> = {}): TaskSeed {
    return { createdById: ownerId, dueAt: new Date(Date.now() + 24 * HOUR_MS), ...fields };
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
    stages = await findStageIds(testApp, workspaceId);
    [clientId = '', deletedClientId = ''] = await insertClients(testApp, workspaceId, [
      { name: 'Romashka LLC', createdById: ownerId },
      { name: 'Gone LLC', createdById: ownerId },
    ]);
    await prisma.client.update({ where: { id: deletedClientId }, data: { deletedAt: new Date() } });
    positions = positionsAfter(null, 60);
  });

  afterAll(async () => {
    await testApp.app.close();
  });

  describe('summary', () => {
    it('should list every open stage in board order with counts and totals per currency when some are empty', async () => {
      await insertDeals(testApp, workspaceId, [
        deal({ stageId: stages.New, amount: 100_00 }),
        deal({ stageId: stages.New, amount: 200_00 }),
        deal({ stageId: stages.New, amount: 50_00, currency: 'EUR' }),
        deal({ stageId: stages['Proposal sent'], amount: 70_00 }),
      ]);

      const result = await summary();

      expect(result.stages).toEqual([
        {
          stage: { id: stages.New, name: 'New', kind: 'open' },
          count: 3,
          totals: [
            { currency: 'USD', amount: 300_00, count: 2 },
            { currency: 'EUR', amount: 50_00, count: 1 },
          ],
        },
        { stage: { id: stages.Call, name: 'Call', kind: 'open' }, count: 0, totals: [] },
        {
          stage: { id: stages['Proposal sent'], name: 'Proposal sent', kind: 'open' },
          count: 1,
          totals: [{ currency: 'USD', amount: 70_00, count: 1 }],
        },
        { stage: { id: stages.Contract, name: 'Contract', kind: 'open' }, count: 0, totals: [] },
      ]);
      expect(result.openDeals).toEqual({
        count: 4,
        totals: [
          { currency: 'USD', amount: 370_00, count: 3 },
          { currency: 'EUR', amount: 50_00, count: 1 },
        ],
      });
    });

    it('should leave out deleted deals, deals of deleted clients and closed deals when they exist', async () => {
      await insertDeals(testApp, workspaceId, [
        deal({ stageId: stages.New }),
        deal({ stageId: stages.New, deletedAt: new Date() }),
        deal({ stageId: stages.New, clientId: deletedClientId }),
        deal({ stageId: stages.Paid, closedAt: new Date() }),
        deal({ stageId: stages.Lost, closedAt: new Date() }),
      ]);

      const result = await summary();

      expect(result.openDeals.count).toBe(1);
      expect(result.stages.map(({ stage }) => stage.kind)).not.toContain('won');
      expect(result.stages.map(({ stage }) => stage.kind)).not.toContain('lost');
    });

    it('should count open and overdue visible tasks when done, deleted and hidden ones exist', async () => {
      const [dealOfGone = ''] = await insertDeals(testApp, workspaceId, [
        deal({ stageId: stages.New, clientId: deletedClientId }),
      ]);
      await insertTasks(testApp, workspaceId, [
        task(),
        task({ dueAt: new Date(Date.now() - HOUR_MS) }),
        task({ doneAt: new Date() }),
        task({ deletedAt: new Date() }),
        task({ clientId: deletedClientId }),
        task({ dealId: dealOfGone, dueAt: new Date(Date.now() - HOUR_MS) }),
      ]);

      const result = await summary();

      expect(result.tasks).toEqual({ open: 2, overdue: 1 });
    });

    it('should list members in join order with their open work when one has nothing', async () => {
      const other = await addManager(testApp, workspaceId);
      const managerId = manager.session.user.id;
      await insertDeals(testApp, workspaceId, [
        deal({ stageId: stages.New, amount: 100_00 }),
        deal({ stageId: stages.Call, amount: 200_00, assigneeId: managerId }),
        deal({ stageId: stages.Paid, assigneeId: managerId, closedAt: new Date() }),
      ]);
      await insertTasks(testApp, workspaceId, [
        task({ assigneeId: managerId }),
        task({ assigneeId: managerId, dueAt: new Date(Date.now() - HOUR_MS) }),
      ]);

      const result = await summary();

      expect(result.members).toEqual([
        {
          member: { id: ownerId, name: 'Ann' },
          openDeals: { count: 1, totals: [{ currency: 'USD', amount: 100_00, count: 1 }] },
          openTasks: 0,
          overdueTasks: 0,
        },
        {
          member: { id: managerId, name: 'Max' },
          openDeals: { count: 1, totals: [{ currency: 'USD', amount: 200_00, count: 1 }] },
          openTasks: 2,
          overdueTasks: 1,
        },
        {
          member: { id: other.session.user.id, name: 'Max' },
          openDeals: { count: 0, totals: [] },
          openTasks: 0,
          overdueTasks: 0,
        },
      ]);
    });

    it('should give a manager the same body as the owner when both read the summary', async () => {
      await insertDeals(testApp, workspaceId, [deal({ stageId: stages.New })]);
      await insertTasks(testApp, workspaceId, [task()]);

      expect(await summary(manager)).toEqual(await summary(owner));
    });

    it("should never count another workspace's records when that workspace has work", async () => {
      const strangerId = stranger.session.user.id;
      const strangerWorkspace = stranger.session.workspace.id;
      const strangerStages = await findStageIds(testApp, strangerWorkspace);
      const [strangerClient = ''] = await insertClients(testApp, strangerWorkspace, [
        { name: 'Their client', createdById: strangerId },
      ]);
      await insertDeals(testApp, strangerWorkspace, [
        deal({ stageId: strangerStages.New, clientId: strangerClient, createdById: strangerId }),
      ]);
      await insertTasks(testApp, strangerWorkspace, [task({ createdById: strangerId })]);

      const result = await summary();

      expect(result.openDeals.count).toBe(0);
      expect(result.tasks).toEqual({ open: 0, overdue: 0 });
      expect(result.members.map(({ member }) => member.id)).not.toContain(strangerId);
    });

    it('should issue the same four statements in one transaction when the workspace grows from empty', async () => {
      const statements = recordStatements(prisma);
      await summary();
      const forEmpty = statements.splice(0);
      const other = await addManager(testApp, workspaceId);
      const assignees = [ownerId, manager.session.user.id, other.session.user.id];
      const openStages = [stages.New, stages.Call, stages['Proposal sent'], stages.Contract];
      await insertDeals(
        testApp,
        workspaceId,
        Array.from({ length: 30 }, (_, index) =>
          deal({
            stageId: openStages[index % openStages.length] ?? stages.New,
            assigneeId: assignees[index % assignees.length],
            currency: index % 2 === 0 ? 'USD' : 'EUR',
          }),
        ),
      );
      await insertTasks(
        testApp,
        workspaceId,
        Array.from({ length: 40 }, (_, index) =>
          task({
            assigneeId: assignees[index % assignees.length],
            dueAt: new Date(Date.now() + (index - 20) * HOUR_MS),
          }),
        ),
      );
      statements.splice(0);

      await summary();
      const forFull = statements.splice(0);

      expect(forFull).toHaveLength(forEmpty.length);
      const commit = forFull.lastIndexOf('COMMIT');
      const dashboard = forFull.slice(commit - 4, commit);
      expect(
        dashboard.filter((query) => /FROM (stages|deals|tasks|memberships)/.test(query)),
      ).toHaveLength(4);
      expect(forFull.filter((query) => query === 'COMMIT')).toHaveLength(1);
    });
  });

  describe('closed deals', () => {
    function at(month: number, day = 15): Date {
      return new Date(Date.UTC(2030, month, day, 12));
    }

    it('should put won and lost deals in the periods that hold their closed_at when they close in different months', async () => {
      await insertDeals(testApp, workspaceId, [
        deal({ stageId: stages.Paid, closedAt: at(1), amount: 500_00 }),
        deal({ stageId: stages.Lost, closedAt: at(2), amount: 70_00 }),
      ]);

      const { periods } = await closed();

      expect(periods).toHaveLength(6);
      expect(periods[0]).toEqual({
        start: BOUNDS[0]?.toISOString(),
        end: BOUNDS[1]?.toISOString(),
        won: { count: 0, totals: [] },
        lost: { count: 0, totals: [] },
      });
      expect(periods[1]?.won).toEqual({
        count: 1,
        totals: [{ currency: 'USD', amount: 500_00, count: 1 }],
      });
      expect(periods[2]?.lost).toEqual({
        count: 1,
        totals: [{ currency: 'USD', amount: 70_00, count: 1 }],
      });
    });

    it('should put a deal closed on a bound in the later period and leave out one outside the range when deals sit on the edges', async () => {
      await insertDeals(testApp, workspaceId, [
        deal({ stageId: stages.Paid, closedAt: BOUNDS[2] }),
        deal({ stageId: stages.Paid, closedAt: new Date(Date.UTC(2029, 11, 31, 23)) }),
        deal({ stageId: stages.Paid, closedAt: BOUNDS[6] }),
      ]);

      const { periods } = await closed();

      expect(periods.map(({ won }) => won.count)).toEqual([0, 0, 1, 0, 0, 0]);
    });

    it('should sum totals per currency when deals of one period differ in currency', async () => {
      await insertDeals(testApp, workspaceId, [
        deal({ stageId: stages.Paid, closedAt: at(3), amount: 100_00 }),
        deal({ stageId: stages.Paid, closedAt: at(3, 20), amount: 300_00 }),
        deal({ stageId: stages.Paid, closedAt: at(3), amount: 40_00, currency: 'EUR' }),
      ]);

      const { periods } = await closed();

      expect(periods[3]?.won).toEqual({
        count: 3,
        totals: [
          { currency: 'USD', amount: 400_00, count: 2 },
          { currency: 'EUR', amount: 40_00, count: 1 },
        ],
      });
    });

    it("should leave out deleted, hidden and another workspace's deals when they closed in range", async () => {
      const strangerWorkspace = stranger.session.workspace.id;
      const strangerId = stranger.session.user.id;
      const strangerStages = await findStageIds(testApp, strangerWorkspace);
      const [strangerClient = ''] = await insertClients(testApp, strangerWorkspace, [
        { name: 'Their client', createdById: strangerId },
      ]);
      await insertDeals(testApp, workspaceId, [
        deal({ stageId: stages.Paid, closedAt: at(1), deletedAt: new Date() }),
        deal({ stageId: stages.Paid, closedAt: at(1), clientId: deletedClientId }),
      ]);
      await insertDeals(testApp, strangerWorkspace, [
        deal({
          stageId: strangerStages.Paid,
          closedAt: at(1),
          clientId: strangerClient,
          createdById: strangerId,
        }),
      ]);

      const { periods } = await closed();

      expect(periods.every(({ won, lost }) => won.count === 0 && lost.count === 0)).toBe(true);
    });

    it('should leave out a reopened deal and count a deal won again in its new month when deals move back', async () => {
      const now = new Date();
      const thisMonth = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1);
      const bounds = [
        new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1)),
        new Date(thisMonth),
        new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)),
      ];
      const body = {
        title: 'Moving deal',
        clientId,
        stageId: stages.New,
        amount: 100_00,
        currency: 'USD',
        assigneeId: ownerId,
      } as const;
      const reopened = await createDeal(owner.http, body);
      const wonAgain = await createDeal(owner.http, body);
      const won = await moveDeal(owner.http, reopened.id, {
        version: reopened.version,
        stageId: stages.Paid,
        afterId: null,
      });
      await moveDeal(owner.http, reopened.id, {
        version: won.version,
        stageId: stages.New,
        afterId: null,
      });
      let current = wonAgain;
      for (const stageId of [stages.Paid, stages.New, stages.Paid]) {
        current = await moveDeal(owner.http, wonAgain.id, {
          version: current.version,
          stageId,
          afterId: null,
        });
      }

      const { periods } = await closed(bounds);

      expect(periods.map(({ won: { count } }) => count)).toEqual([0, 1]);
    });

    it('should read closed deals with one statement when deals close in several periods', async () => {
      await insertDeals(testApp, workspaceId, [
        deal({ stageId: stages.Paid, closedAt: at(0) }),
        deal({ stageId: stages.Lost, closedAt: at(4) }),
      ]);
      const statements = recordStatements(prisma);

      await closed();

      expect(statements.filter((query) => query.includes('FROM stages'))).toHaveLength(1);
    });

    it('should answer 400 on bounds when only one bound is sent', async () => {
      const response = await owner.http.get(
        `/api/dashboard/closed-deals?${boundsQuery(BOUNDS.slice(0, 1))}`,
      );

      expect(response.status).toBe(400);
      expect(apiProblemSchema.parse(response.body).errors).toEqual([
        { path: 'bounds', message: 'Use 2 to 13 bounds in ascending order' },
      ]);
    });
  });

  it.each(['/api/dashboard/summary', `/api/dashboard/closed-deals?${boundsQuery(BOUNDS)}`])(
    'should answer 401 when %s is requested without the access cookie',
    async (path) => {
      const response = await agent(testApp.app.getHttpServer()).get(path);

      expect(response.status).toBe(401);
      expect(apiProblemSchema.parse(response.body).code).toBe('AUTHENTICATION_REQUIRED');
    },
  );
});
