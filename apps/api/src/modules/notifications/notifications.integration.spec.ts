import { agent } from 'supertest';
import type { Agent, Response } from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { apiProblemSchema } from '@clientry/shared/common';
import {
  notificationListResponseSchema,
  unreadCountResponseSchema,
} from '@clientry/shared/notifications';

import { createTestApp } from '../../../test/create-test-app.js';
import type { TestApp } from '../../../test/create-test-app.js';
import { addManager, registerAccount } from '../../../test/fixtures/accounts.js';
import type { TestAccount } from '../../../test/fixtures/accounts.js';
import { insertNotifications } from '../../../test/fixtures/notifications.js';
import { resetDatabase } from '../../../test/reset-database.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';

const UNKNOWN_ID = '0199c3b0-1a2b-7c3d-8e4f-5a6b7c8d9e0f';
const START = Date.parse('2026-10-15T06:00:00.000Z');

function at(minutes: number): Date {
  return new Date(START + minutes * 60_000);
}

function problemCode(response: Response): string {
  return apiProblemSchema.parse(response.body).code;
}

describe('notifications API', () => {
  let testApp: TestApp;
  let prisma: PrismaService;
  let owner: TestAccount;
  let manager: TestAccount;
  let stranger: TestAccount;

  function send(): Agent {
    return agent(testApp.app.getHttpServer());
  }

  function seedFor(account: TestAccount, minutes: readonly number[]): Promise<string[]> {
    return insertNotifications(
      testApp,
      minutes.map((minute) => ({
        workspaceId: account.session.workspace.id,
        userId: account.session.user.id,
        createdAt: at(minute),
        title: `Reminder ${String(minute)}`,
      })),
    );
  }

  async function readAt(id: string): Promise<Date | null> {
    const row = await prisma.notification.findUniqueOrThrow({ where: { id } });
    return row.readAt;
  }

  async function unreadCount(account: TestAccount): Promise<number> {
    const response = await account.http.get('/api/notifications/unread-count').expect(200);
    return unreadCountResponseSchema.parse(response.body).count;
  }

  beforeAll(async () => {
    testApp = await createTestApp();
    prisma = testApp.app.get(PrismaService);
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
    owner = await registerAccount(testApp, 'Pixel Studio');
    stranger = await registerAccount(testApp, 'Other Studio');
    manager = await addManager(testApp, owner.session.workspace.id);
  });

  afterAll(async () => {
    await testApp.app.close();
  });

  describe('list', () => {
    it('should list newest first with their snapshot when the caller has several notifications', async () => {
      await seedFor(owner, [1, 3, 2]);

      const response = await owner.http.get('/api/notifications').expect(200);

      const { items, nextCursor } = notificationListResponseSchema.parse(response.body);
      expect(items.map(({ createdAt }) => createdAt)).toEqual(
        [3, 2, 1].map((minute) => at(minute).toISOString()),
      );
      expect(items[0]).toMatchObject({
        type: 'task_reminder',
        payload: { task: { title: 'Reminder 3' }, dueAt: '2030-03-15T12:00:00.000Z' },
        readAt: null,
      });
      expect(nextCursor).toBeNull();
    });

    it('should leave out notifications of another user and another workspace when the caller lists', async () => {
      await seedFor(manager, [1]);
      await seedFor(stranger, [2]);
      const [own] = await seedFor(owner, [3]);

      const response = await owner.http.get('/api/notifications').expect(200);

      expect(notificationListResponseSchema.parse(response.body).items.map(({ id }) => id)).toEqual(
        [own],
      );
    });

    it('should return every notification once when pages follow the cursor', async () => {
      const ids = await seedFor(
        owner,
        Array.from({ length: 7 }, (_value, index) => index),
      );
      const seen: string[] = [];
      let cursor: string | null = null;
      let pages = 0;

      do {
        const query: Record<string, string> = { limit: '3', ...(cursor ? { cursor } : {}) };
        const response = await owner.http.get('/api/notifications').query(query).expect(200);
        const page = notificationListResponseSchema.parse(response.body);
        seen.push(...page.items.map(({ id }) => id));
        cursor = page.nextCursor;
        pages += 1;
      } while (cursor !== null);

      expect(pages).toBe(3);
      expect(seen).toEqual(ids.toReversed());
    });

    it('should break ties by id when notifications share a creation time', async () => {
      const ids = await seedFor(owner, [5, 5, 5]);

      const first = await owner.http.get('/api/notifications').query({ limit: 2 }).expect(200);
      const firstPage = notificationListResponseSchema.parse(first.body);
      const second = await owner.http
        .get('/api/notifications')
        .query({ limit: 2, cursor: firstPage.nextCursor })
        .expect(200);

      const order = [
        ...firstPage.items,
        ...notificationListResponseSchema.parse(second.body).items,
      ].map(({ id }) => id);
      expect(order).toEqual(ids.toSorted().toReversed());
    });

    it('should answer 400 on cursor when the cursor is broken', async () => {
      const response = await owner.http.get('/api/notifications').query({ cursor: 'not-a-cursor' });

      expect(response.status).toBe(400);
      expect(apiProblemSchema.parse(response.body).errors).toEqual([
        { path: 'cursor', message: 'Invalid cursor' },
      ]);
    });

    it('should answer 500 when a stored payload does not parse', async () => {
      const [id = ''] = await seedFor(owner, [1]);
      await prisma.notification.update({ where: { id }, data: { payload: { task: null } } });

      expect((await owner.http.get('/api/notifications')).status).toBe(500);
    });
  });

  describe('unread count', () => {
    it('should count only the caller unread notifications when others have unread ones too', async () => {
      const [read = ''] = await seedFor(owner, [1, 2]);
      await prisma.notification.update({ where: { id: read }, data: { readAt: at(10) } });
      await seedFor(manager, [3]);
      await seedFor(stranger, [4]);

      expect(await unreadCount(owner)).toBe(1);
    });

    it('should stop at 100 when 101 are unread', async () => {
      await seedFor(
        owner,
        Array.from({ length: 101 }, (_value, index) => index),
      );

      expect(await unreadCount(owner)).toBe(100);
    });
  });

  describe('mark as read', () => {
    it('should answer 204 and keep the first read time when a notification is read twice', async () => {
      const [id = ''] = await seedFor(owner, [1]);

      await owner.http.post(`/api/notifications/${id}/read`).expect(204);
      const first = await readAt(id);
      await owner.http.post(`/api/notifications/${id}/read`).expect(204);

      expect(first).not.toBeNull();
      expect(await readAt(id)).toEqual(first);
      expect(await unreadCount(owner)).toBe(0);
    });

    it.each([
      ['another user', (): TestAccount => manager],
      ['another workspace', (): TestAccount => stranger],
    ])(
      'should answer 404 and change nothing when the notification belongs to %s',
      async (_case, other) => {
        const [id = ''] = await seedFor(other(), [1]);

        const response = await owner.http.post(`/api/notifications/${id}/read`);

        expect(response.status).toBe(404);
        expect(problemCode(response)).toBe('NOTIFICATION_NOT_FOUND');
        expect(await readAt(id)).toBeNull();
      },
    );

    it('should answer 400 on id when the id is malformed', async () => {
      const response = await owner.http.post('/api/notifications/42/read');

      expect(response.status).toBe(400);
      expect(apiProblemSchema.parse(response.body).errors?.[0]?.path).toBe('id');
    });

    it('should mark only the caller unread notifications up to before when read-all is sent', async () => {
      const [older = '', seen = '', newer = ''] = await seedFor(owner, [1, 2, 3]);
      const [other = ''] = await seedFor(manager, [1]);

      await owner.http
        .post('/api/notifications/read-all')
        .send({ before: at(2).toISOString() })
        .expect(204);

      expect(await readAt(older)).not.toBeNull();
      expect(await readAt(seen)).not.toBeNull();
      expect(await readAt(newer)).toBeNull();
      expect(await readAt(other)).toBeNull();
    });

    it('should answer 400 on before when it is missing', async () => {
      const response = await owner.http.post('/api/notifications/read-all').send({});

      expect(response.status).toBe(400);
      expect(apiProblemSchema.parse(response.body).errors?.[0]?.path).toBe('before');
    });
  });

  describe('access', () => {
    it.each([
      ['get', '/api/notifications'],
      ['get', '/api/notifications/unread-count'],
      ['post', `/api/notifications/${UNKNOWN_ID}/read`],
      ['post', '/api/notifications/read-all'],
    ] as const)('should answer 401 when %s %s gets no access cookie', async (method, path) => {
      const response = await send()[method](path);

      expect(response.status).toBe(401);
      expect(problemCode(response)).toBe('AUTHENTICATION_REQUIRED');
    });

    it.each([`/api/notifications/${UNKNOWN_ID}/read`, '/api/notifications/read-all'])(
      'should answer 403 UNTRUSTED_ORIGIN when post %s comes from an untrusted origin',
      async (path) => {
        const response = await owner.http.post(path).set('Origin', 'https://evil.example');

        expect(response.status).toBe(403);
        expect(problemCode(response)).toBe('UNTRUSTED_ORIGIN');
      },
    );
  });
});
