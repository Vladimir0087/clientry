import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { activityFeedResponseSchema } from '@clientry/shared/activity';
import { clientListResponseSchema } from '@clientry/shared/clients';
import {
  closedDealsResponseSchema,
  dashboardSummaryResponseSchema,
} from '@clientry/shared/dashboard';
import { boardResponseSchema, dealHistoryResponseSchema } from '@clientry/shared/deals';
import {
  notificationListResponseSchema,
  unreadCountResponseSchema,
} from '@clientry/shared/notifications';
import { taskListResponseSchema } from '@clientry/shared/tasks';

import { PEOPLE } from './data/people.js';
import { createTestApp } from '../../../test/create-test-app.js';
import type { TestApp } from '../../../test/create-test-app.js';
import type { TestAccount } from '../../../test/fixtures/accounts.js';
import { enterDemo, resetDemo } from '../../../test/fixtures/demo.js';
import { resetDatabase } from '../../../test/reset-database.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';

const PAGE_LIMIT = 50;

// The won chart's six months in UTC: month starts, oldest first, through the next month.
function sixMonthBounds(now: Date): string[] {
  return Array.from({ length: 7 }, (_, index) =>
    new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 5 + index, 1)).toISOString(),
  );
}

// Follows nextCursor to the end; every page must pass the response schema.
async function readAllPages(
  account: TestAccount,
  path: string,
  parse: (body: unknown) => {
    readonly items: readonly unknown[];
    readonly nextCursor: string | null;
  },
): Promise<number> {
  let count = 0;
  let cursor: string | null = null;
  do {
    const query: Record<string, string | number> = { limit: PAGE_LIMIT };
    if (cursor !== null) {
      query.cursor = cursor;
    }
    const response = await account.http.get(path).query(query).expect(200);
    const page = parse(response.body);
    count += page.items.length;
    cursor = page.nextCursor;
  } while (cursor !== null);
  return count;
}

describe('demo through the API', () => {
  let testApp: TestApp;
  let owner: TestAccount;
  let manager: TestAccount;

  beforeAll(async () => {
    testApp = await createTestApp();
    await resetDatabase(testApp.app.get(PrismaService));
    await resetDemo(testApp);
    owner = await enterDemo(testApp, 'owner');
    manager = await enterDemo(testApp, 'manager');
  });

  afterAll(async () => {
    await testApp.app.close();
  });

  describe.each([
    ['owner', () => owner],
    ['manager', () => manager],
  ] as const)('as the demo %s', (_role, visitor) => {
    it('should show deals in every open stage when the board is read', async () => {
      const response = await visitor().http.get('/api/deals/board').expect(200);

      const { columns } = boardResponseSchema.parse(response.body);
      const open = columns.filter(({ stage }) => stage.kind === 'open');
      expect(open.map(({ count }) => count)).toEqual([5, 5, 4, 4]);
    });

    it('should list all 40 clients over every page when the client list is read', async () => {
      const count = await readAllPages(visitor(), '/api/clients', (body) =>
        clientListResponseSchema.parse(body),
      );

      expect(count).toBe(40);
    });

    it.each(['open', 'done'])(
      'should list %s tasks for every assignee filter when the task list is read',
      async (status) => {
        const filters = [undefined, 'me', ...Object.values(PEOPLE).map(({ id }) => id)];
        for (const assignee of filters) {
          const query = assignee === undefined ? { status } : { status, assignee };
          const response = await visitor().http.get('/api/tasks').query(query).expect(200);

          taskListResponseSchema.parse(response.body);
        }
      },
    );

    it('should fill the dashboard summary when it is read', async () => {
      const response = await visitor().http.get('/api/dashboard/summary').expect(200);

      const summary = dashboardSummaryResponseSchema.parse(response.body);
      const openStages = summary.stages.filter(({ stage }) => stage.kind === 'open');
      expect(openStages.every(({ count }) => count > 0)).toBe(true);
      expect(summary.tasks.overdue).toBeGreaterThan(0);
      expect(summary.members).toHaveLength(5);
    });

    it('should answer the closed deals of six months when the won chart is read', async () => {
      const query = new URLSearchParams(
        sixMonthBounds(new Date()).map((bound): [string, string] => ['bounds', bound]),
      );

      const response = await visitor()
        .http.get(`/api/dashboard/closed-deals?${query.toString()}`)
        .expect(200);

      expect(closedDealsResponseSchema.parse(response.body).periods).toHaveLength(6);
    });

    it('should read the whole activity feed when every page is fetched', async () => {
      const count = await readAllPages(visitor(), '/api/activity', (body) =>
        activityFeedResponseSchema.parse(body),
      );

      expect(count).toBeGreaterThan(200);
    });

    it('should read the history of every deal when each deal is opened', async () => {
      const ids = await testApp.app.get(PrismaService).deal.findMany({ select: { id: true } });

      expect(ids).toHaveLength(45);
      for (const { id } of ids) {
        const response = await visitor().http.get(`/api/deals/${id}/history`).expect(200);
        dealHistoryResponseSchema.parse(response.body);
      }
    });

    it('should read the notifications when the bell is opened', async () => {
      const response = await visitor().http.get('/api/notifications').expect(200);

      expect(notificationListResponseSchema.parse(response.body).items.length).toBeGreaterThan(0);
    });
  });

  it.each([
    ['owner', () => owner, 2],
    ['manager', () => manager, 1],
  ] as const)(
    'should count the unread notifications of the demo %s when the bell is read',
    async (_role, visitor, count) => {
      const response = await visitor().http.get('/api/notifications/unread-count').expect(200);

      expect(unreadCountResponseSchema.parse(response.body).count).toBe(count);
    },
  );

  it("should list Max's 5 open tasks under the me filter when the manager reads his tasks", async () => {
    const response = await manager.http.get('/api/tasks').query({ assignee: 'me' }).expect(200);

    const { items } = taskListResponseSchema.parse(response.body);
    expect(items).toHaveLength(5);
    expect(items.every(({ assignee }) => assignee.id === PEOPLE.max.id)).toBe(true);
  });
});
