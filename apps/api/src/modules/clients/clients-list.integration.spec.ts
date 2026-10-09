import type { Response } from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { clientListResponseSchema, clientTagsResponseSchema } from '@clientry/shared/clients';
import type { ClientListResponse, ClientSort } from '@clientry/shared/clients';
import { apiProblemSchema } from '@clientry/shared/common';

import { createTestApp } from '../../../test/create-test-app.js';
import type { TestApp } from '../../../test/create-test-app.js';
import { addManager, registerAccount } from '../../../test/fixtures/accounts.js';
import type { TestAccount } from '../../../test/fixtures/accounts.js';
import { insertClients } from '../../../test/fixtures/clients.js';
import type { ClientSeed } from '../../../test/fixtures/clients.js';
import { resetDatabase } from '../../../test/reset-database.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';

const SORTS: readonly ClientSort[] = ['newest', 'oldest', 'name_asc', 'name_desc'];

function minutesAfterNoon(minutes: number): Date {
  return new Date(Date.UTC(2026, 9, 8, 12, minutes));
}

function parseList(response: Response): ClientListResponse {
  expect(response.status).toBe(200);
  return clientListResponseSchema.parse(response.body);
}

function errorPaths(response: Response): string[] {
  return (apiProblemSchema.parse(response.body).errors ?? []).map(({ path }) => path);
}

describe('clients list API', () => {
  let testApp: TestApp;
  let prisma: PrismaService;
  let owner: TestAccount;
  let ownerId: string;
  let workspaceId: string;

  async function list(query = '', account = owner): Promise<ClientListResponse> {
    return parseList(await account.http.get(`/api/clients${query}`));
  }

  async function names(query = '', account = owner): Promise<string[]> {
    return (await list(query, account)).items.map(({ name }) => name);
  }

  function seed(seeds: readonly Omit<ClientSeed, 'createdById'>[]): Promise<string[]> {
    return insertClients(
      testApp,
      workspaceId,
      seeds.map((client) => ({ createdById: ownerId, ...client })),
    );
  }

  async function walk(sort: ClientSort, limit: number): Promise<ClientListResponse[]> {
    const pages: ClientListResponse[] = [];
    let cursor: string | null = null;
    do {
      const after: string = cursor === null ? '' : `&cursor=${cursor}`;
      const page = await list(`?sort=${sort}&limit=${String(limit)}${after}`);
      pages.push(page);
      cursor = page.nextCursor;
    } while (cursor !== null);
    return pages;
  }

  beforeAll(async () => {
    testApp = await createTestApp();
    prisma = testApp.app.get(PrismaService);
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
    owner = await registerAccount(testApp, 'Pixel Studio');
    ownerId = owner.session.user.id;
    workspaceId = owner.session.workspace.id;
  });

  afterAll(async () => {
    await testApp.app.close();
  });

  describe('scope and order', () => {
    it('should list only active clients of the caller workspace when other rows exist', async () => {
      const stranger = await registerAccount(testApp, 'Other Studio');
      await insertClients(testApp, stranger.session.workspace.id, [
        { name: 'Foreign', createdById: stranger.session.user.id },
      ]);
      const [, deletedId] = await seed([{ name: 'Active' }, { name: 'Deleted' }]);
      await owner.http.delete(`/api/clients/${deletedId ?? ''}`).expect(204);

      expect(await names()).toEqual(['Active']);
    });

    it('should order by created_at when the sort is newest or oldest', async () => {
      await seed([
        { name: 'First', createdAt: minutesAfterNoon(1) },
        { name: 'Second', createdAt: minutesAfterNoon(2) },
      ]);

      expect(await names()).toEqual(['Second', 'First']);
      expect(await names('?sort=oldest')).toEqual(['First', 'Second']);
    });

    it('should order names case-insensitively when the sort is by name', async () => {
      await seed([{ name: 'zeta' }, { name: 'Beta' }, { name: 'acme' }]);

      expect(await names('?sort=name_asc')).toEqual(['acme', 'Beta', 'zeta']);
      expect(await names('?sort=name_desc')).toEqual(['zeta', 'Beta', 'acme']);
    });

    it('should order by id when created_at is equal', async () => {
      const at = minutesAfterNoon(5);
      const ids = await seed([
        { name: 'A', createdAt: at },
        { name: 'B', createdAt: at },
        { name: 'C', createdAt: at },
      ]);

      const listed = (await list('?sort=oldest')).items.map(({ id }) => id);

      expect(listed).toEqual(ids.toSorted());
    });
  });

  describe('pagination', () => {
    it.each(SORTS)(
      'should return every client exactly once over three pages when the sort is %s',
      async (sort) => {
        const ids = await seed(
          ['echo', 'Alpha', 'delta', 'Charlie', 'bravo'].map((name, index) => ({
            name,
            createdAt: minutesAfterNoon(index),
          })),
        );

        const pages = await walk(sort, 2);

        expect(pages.map(({ items }) => items.length)).toEqual([2, 2, 1]);
        expect(pages.at(-1)?.nextCursor).toBeNull();
        const walked = pages.flatMap(({ items }) => items.map(({ id }) => id));
        expect(walked.toSorted()).toEqual(ids.toSorted());
      },
    );

    it('should neither skip nor repeat a row when a client is deleted between pages', async () => {
      const [first, second, third, fourth] = await seed(
        ['A', 'B', 'C', 'D'].map((name, index) => ({ name, createdAt: minutesAfterNoon(index) })),
      );
      const page = await list('?sort=oldest&limit=2');
      await owner.http.delete(`/api/clients/${first ?? ''}`).expect(204);

      const next = await list(`?sort=oldest&limit=2&cursor=${page.nextCursor ?? ''}`);

      expect(page.items.map(({ id }) => id)).toEqual([first, second]);
      expect(next.items.map(({ id }) => id)).toEqual([third, fourth]);
    });

    it('should keep the position when the last row of a page is renamed', async () => {
      await seed([{ name: 'Anna' }, { name: 'Boris' }, { name: 'Clara' }, { name: 'Dmitry' }]);
      const page = await list('?sort=name_asc&limit=2');
      const last = page.items.at(-1);
      await owner.http
        .patch(`/api/clients/${last?.id ?? ''}`)
        .send({ name: 'Zorro' })
        .expect(200);

      const next = await list(`?sort=name_asc&limit=2&cursor=${page.nextCursor ?? ''}`);

      expect(next.items.map(({ name }) => name)).toEqual(['Clara', 'Dmitry']);
    });

    it('should page past a 200-character Cyrillic name with quotes when it ends a page', async () => {
      const longName = `Жук "${'ж'.repeat(194)}"`;
      await seed([{ name: 'acme' }, { name: longName }, { name: 'Ярослав' }]);

      const pages = await walk('name_asc', 2);

      expect(longName).toHaveLength(200);
      expect(pages.flatMap(({ items }) => items.map(({ name }) => name))).toEqual([
        'acme',
        longName,
        'Ярослав',
      ]);
    });

    it('should answer 400 on cursor when the cursor was made for another sort', async () => {
      await seed([{ name: 'A' }, { name: 'B' }]);
      const { nextCursor } = await list('?limit=1');

      const response = await owner.http.get(
        `/api/clients?sort=name_asc&cursor=${nextCursor ?? ''}`,
      );

      expect(response.status).toBe(400);
      expect(errorPaths(response)).toEqual(['cursor']);
    });

    it('should answer 400 on cursor when the cursor is tampered with', async () => {
      await seed([{ name: 'A' }, { name: 'B' }]);
      const { nextCursor } = await list('?limit=1');
      const tampered = `${(nextCursor ?? '').slice(0, -2)}xx`;

      const response = await owner.http.get(`/api/clients?cursor=${tampered}`);

      expect(response.status).toBe(400);
      expect(errorPaths(response)).toEqual(['cursor']);
    });
  });

  describe('search', () => {
    beforeEach(async () => {
      await seed([
        { name: 'Romashka LLC' },
        { name: 'Ann', company: 'Pixel Forge' },
        { name: 'Boris', email: 'boris.k@mail.example' },
        { name: 'Clara', phone: '+375 29 123-45-67' },
        { name: '1000 Corp' },
        { name: '100% Corp' },
        { name: 'abc' },
        { name: 'a_c Ltd' },
      ]);
    });

    it.each([
      ['the name', 'MASHK', 'Romashka LLC'],
      ['the company', 'xel fo', 'Ann'],
      ['the email', 'S.K@MAIL', 'Boris'],
      ['the phone', '123-45', 'Clara'],
    ])('should find the client by the middle of %s', async (_case, q, name) => {
      expect(await names(`?q=${encodeURIComponent(q)}`)).toEqual([name]);
    });

    it('should match % literally when the term holds it', async () => {
      expect(await names(`?q=${encodeURIComponent('100%')}`)).toEqual(['100% Corp']);
    });

    it('should match _ literally when the term holds it', async () => {
      expect(await names('?q=a_c')).toEqual(['a_c Ltd']);
    });

    it('should filter nothing when the term is blank', async () => {
      expect(await names('?q=%20%20')).toHaveLength(8);
    });
  });

  describe('filters', () => {
    let manager: TestAccount;

    beforeEach(async () => {
      manager = await addManager(testApp, workspaceId);
      await insertClients(testApp, workspaceId, [
        { name: 'Web VIP', source: 'website', tags: ['vip', 'warm'], createdById: ownerId },
        { name: 'Web cold', source: 'website', tags: ['cold'], createdById: ownerId },
        { name: 'Tg VIP', source: 'telegram', tags: ['vip'], createdById: manager.session.user.id },
        { name: 'Referral', source: 'referral', tags: ['warm'], createdById: ownerId },
      ]);
    });

    it('should keep the clients of one source when one source is given', async () => {
      expect(await names('?source=website&sort=name_asc')).toEqual(['Web cold', 'Web VIP']);
    });

    it('should keep the clients of any source when two sources are given', async () => {
      expect(await names('?source=website&source=telegram&sort=name_asc')).toEqual([
        'Tg VIP',
        'Web cold',
        'Web VIP',
      ]);
    });

    it('should keep only clients with all the tags when several tags are given', async () => {
      expect(await names('?tag=vip&tag=warm')).toEqual(['Web VIP']);
    });

    it('should keep the caller clients when createdBy is me for the owner', async () => {
      expect(await names('?createdBy=me&sort=name_asc')).toEqual([
        'Referral',
        'Web cold',
        'Web VIP',
      ]);
    });

    it('should keep the caller clients when createdBy is me for a manager', async () => {
      expect(await names('?createdBy=me', manager)).toEqual(['Tg VIP']);
    });

    it('should apply every filter together when they are combined', async () => {
      expect(
        await names('?q=web&source=website&source=telegram&tag=vip&createdBy=me&sort=name_desc'),
      ).toEqual(['Web VIP']);
    });
  });

  describe('tags', () => {
    it('should count the tags of active clients in the caller workspace when tags are listed', async () => {
      const stranger = await registerAccount(testApp, 'Other Studio');
      await insertClients(testApp, stranger.session.workspace.id, [
        { name: 'Foreign', tags: ['alien'], createdById: stranger.session.user.id },
      ]);
      const [, deletedId] = await seed([
        { name: 'A', tags: ['warm', 'vip'] },
        { name: 'B', tags: ['zeta', 'gone'] },
        { name: 'C', tags: ['warm', 'beta', 'ёлка'] },
        { name: 'D', tags: ['яблоко', 'Zeta'] },
      ]);
      await owner.http.delete(`/api/clients/${deletedId ?? ''}`).expect(204);

      const response = await owner.http.get('/api/clients/tags').expect(200);

      expect(clientTagsResponseSchema.parse(response.body).items).toEqual([
        { tag: 'beta', count: 1 },
        { tag: 'vip', count: 1 },
        { tag: 'warm', count: 2 },
        { tag: 'Zeta', count: 1 },
        { tag: 'ёлка', count: 1 },
        { tag: 'яблоко', count: 1 },
      ]);
    });
  });

  describe('query count', () => {
    it('should issue as many SQL statements when 25 clients by three creators are listed as for one', async () => {
      const managers = await Promise.all([
        addManager(testApp, workspaceId),
        addManager(testApp, workspaceId),
      ]);
      const creators = [ownerId, ...managers.map(({ session }) => session.user.id)];
      await insertClients(
        testApp,
        workspaceId,
        Array.from({ length: 25 }, (_, index) => ({
          name: `Client ${String(index)}`,
          createdById: creators[index % creators.length] ?? ownerId,
        })),
      );
      const statements: string[] = [];
      prisma.$on('query', (event) => {
        statements.push(event.query);
      });

      await list('?limit=1');
      const forOne = statements.splice(0).length;
      await list('?limit=25');
      const forPage = statements.splice(0).length;

      expect(forOne).toBeGreaterThan(0);
      expect(forPage).toBe(forOne);
    });
  });
});
