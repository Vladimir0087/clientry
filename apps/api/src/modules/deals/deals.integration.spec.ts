import { agent } from 'supertest';
import type { Agent, Response, Test } from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { Client } from '@clientry/shared/clients';
import { apiProblemSchema } from '@clientry/shared/common';
import {
  boardResponseSchema,
  dealHistoryResponseSchema,
  dealListResponseSchema,
  dealSchema,
} from '@clientry/shared/deals';
import type {
  Board,
  CreateDealRequest,
  Deal,
  DealActivity,
  DealHistoryResponse,
} from '@clientry/shared/deals';

import { positionBetween } from './deal-position.js';
import { DealsRepository } from './deals.repository.js';
import { BoardChangedError } from './errors.js';
import { createTestApp } from '../../../test/create-test-app.js';
import type { TestApp } from '../../../test/create-test-app.js';
import { addManager, registerAccount } from '../../../test/fixtures/accounts.js';
import type { TestAccount } from '../../../test/fixtures/accounts.js';
import { createClient } from '../../../test/fixtures/clients.js';
import {
  createDeal,
  findStageIds,
  insertActivities,
  moveDeal,
} from '../../../test/fixtures/deals.js';
import type { StageIds } from '../../../test/fixtures/deals.js';
import { resetDatabase } from '../../../test/reset-database.js';
import { RequestValidationError } from '../../common/errors/request-validation.error.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';

const UNKNOWN_ID = '0199b1e2-3c4d-7e5f-8a9b-0c1d2e3f4a5b';

function problemCode(response: Response): string {
  return apiProblemSchema.parse(response.body).code;
}

function errorPaths(response: Response): string[] {
  return (apiProblemSchema.parse(response.body).errors ?? []).map(({ path }) => path);
}

async function expectDealNotFound(request: Test): Promise<void> {
  const response = await request;
  expect(response.status).toBe(404);
  expect(problemCode(response)).toBe('DEAL_NOT_FOUND');
}

describe('deals API', () => {
  let testApp: TestApp;
  let prisma: PrismaService;
  let owner: TestAccount;
  let manager: TestAccount;
  let stranger: TestAccount;
  let stages: StageIds;
  let client: Client;

  function send(): Agent {
    return agent(testApp.app.getHttpServer());
  }

  function dealBody(overrides: Partial<CreateDealRequest> = {}): CreateDealRequest {
    return {
      title: 'Landing page',
      clientId: client.id,
      stageId: stages.New,
      amount: 150_000,
      currency: 'USD',
      assigneeId: owner.session.user.id,
      ...overrides,
    };
  }

  async function board(account = owner): Promise<Board> {
    const response = await account.http.get('/api/deals/board').expect(200);
    return boardResponseSchema.parse(response.body);
  }

  async function boardIds(account = owner): Promise<string[]> {
    return (await board(account)).columns.flatMap(({ deals }) => deals.map(({ id }) => id));
  }

  async function historyOf(id: string): Promise<DealHistoryResponse> {
    const response = await owner.http.get(`/api/deals/${id}/history`).expect(200);
    return dealHistoryResponseSchema.parse(response.body);
  }

  async function historyTypes(id: string): Promise<DealActivity['type'][]> {
    return (await historyOf(id)).items.map(({ type }) => type);
  }

  async function clientDealIds(clientId: string, account = owner): Promise<string[]> {
    const response = await account.http.get(`/api/deals?clientId=${clientId}`).expect(200);
    return dealListResponseSchema.parse(response.body).items.map(({ id }) => id);
  }

  async function storedDeal(id: string): Promise<Record<string, unknown> | null> {
    return prisma.deal.findUnique({ where: { id } });
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
    stages = await findStageIds(testApp, owner.session.workspace.id);
    client = await createClient(owner.http, { name: 'Romashka LLC' });
  });

  afterAll(async () => {
    await testApp.app.close();
  });

  describe('create', () => {
    it('should answer 201 with the deal first in its column and one created entry when the input is valid', async () => {
      const older = await createDeal(owner.http, dealBody({ title: 'Older' }));

      const response = await owner.http.post('/api/deals').send(dealBody());

      expect(response.status).toBe(201);
      const deal = dealSchema.parse(response.body);
      expect(deal).toMatchObject({
        title: 'Landing page',
        amount: 150_000,
        currency: 'USD',
        stage: { id: stages.New, name: 'New', kind: 'open' },
        client: { id: client.id, name: 'Romashka LLC' },
        assignee: { id: owner.session.user.id, name: 'Ann' },
        createdBy: { id: owner.session.user.id, name: 'Ann' },
        closedAt: null,
        version: 1,
      });
      const column = (await board()).columns.find(({ stage }) => stage.id === stages.New);
      expect(column?.deals.map(({ id }) => id)).toEqual([deal.id, older.id]);
      const history = await historyOf(deal.id);
      expect(history.items).toMatchObject([
        {
          type: 'deal_created',
          actor: { id: owner.session.user.id, name: 'Ann' },
          payload: {
            stage: { id: stages.New, name: 'New', kind: 'open' },
            amount: 150_000,
            currency: 'USD',
          },
        },
      ]);
    });

    it('should set closedAt when the deal is created in the won stage', async () => {
      const deal = await createDeal(owner.http, dealBody({ stageId: stages.Paid }));

      expect(deal.closedAt).not.toBeNull();
    });

    it.each([
      ['a client of another workspace', 'clientId'],
      ['a deleted client', 'clientId'],
      ['a stage of another workspace', 'stageId'],
      ['an assignee outside the workspace', 'assigneeId'],
    ])('should answer 400 and write nothing when the body has %s', async (reference, path) => {
      const foreignClient = await createClient(stranger.http);
      const deletedClient = await createClient(owner.http, { name: 'Gone' });
      await owner.http.delete(`/api/clients/${deletedClient.id}`).expect(204);
      const foreignStages = await findStageIds(testApp, stranger.session.workspace.id);
      const bodies: Record<string, Partial<CreateDealRequest>> = {
        'a client of another workspace': { clientId: foreignClient.id },
        'a deleted client': { clientId: deletedClient.id },
        'a stage of another workspace': { stageId: foreignStages.New },
        'an assignee outside the workspace': { assigneeId: stranger.session.user.id },
      };

      const response = await owner.http.post('/api/deals').send(dealBody(bodies[reference]));

      expect(response.status).toBe(400);
      expect(errorPaths(response)).toEqual([path]);
      expect(await prisma.deal.count()).toBe(0);
    });

    it('should ignore workspaceId, createdById, position and version when the body has them', async () => {
      const response = await owner.http.post('/api/deals').send({
        ...dealBody(),
        workspaceId: stranger.session.workspace.id,
        createdById: stranger.session.user.id,
        position: '!!!',
        version: 7,
      });

      const deal = dealSchema.parse(response.body);
      expect(await storedDeal(deal.id)).toMatchObject({
        workspaceId: owner.session.workspace.id,
        createdById: owner.session.user.id,
        version: 1,
      });
      expect((await storedDeal(deal.id))?.position).not.toBe('!!!');
    });

    it('should hold a client delete back when a deal transaction has read the client', async () => {
      const deals = testApp.app.get(DealsRepository);

      const write = deals.inTransaction(async (tx) => {
        await tx.findClient(owner.session.workspace.id, client.id);
        await prisma.$transaction(async (other) => {
          await other.$executeRaw`SET LOCAL lock_timeout = '200ms'`;
          await other.client.update({ where: { id: client.id }, data: { deletedAt: new Date() } });
        });
      });

      await expect(write).rejects.toThrow(/lock timeout/);
      expect((await prisma.client.findUnique({ where: { id: client.id } }))?.deletedAt).toBeNull();
    });

    it('should hold a member removal back when a deal transaction has read the member', async () => {
      const deals = testApp.app.get(DealsRepository);

      const write = deals.inTransaction(async (tx) => {
        await tx.findMember(owner.session.workspace.id, manager.session.user.id);
        await prisma.$transaction(async (other) => {
          await other.$executeRaw`SET LOCAL lock_timeout = '200ms'`;
          await other.membership.delete({ where: { userId: manager.session.user.id } });
        });
      });

      await expect(write).rejects.toThrow(/lock timeout/);
      expect(
        await prisma.membership.findUnique({ where: { userId: manager.session.user.id } }),
      ).not.toBeNull();
    });

    it('should report the stage when the repository writes into a stage that is gone', async () => {
      const deals = testApp.app.get(DealsRepository);

      const write = deals.inTransaction((tx) =>
        tx.create(owner.session.workspace.id, owner.session.user.id, {
          ...dealBody({ stageId: UNKNOWN_ID }),
          position: positionBetween(null, null),
          closedAt: null,
        }),
      );

      await expect(write).rejects.toBeInstanceOf(RequestValidationError);
      await expect(write).rejects.toMatchObject({ fieldErrors: [{ path: 'stageId' }] });
    });

    it('should answer BOARD_CHANGED when the repository moves a deal into a stage that is gone', async () => {
      const deal = await createDeal(owner.http, dealBody());
      const deals = testApp.app.get(DealsRepository);

      const write = deals.inTransaction((tx) =>
        tx.move(owner.session.workspace.id, deal.id, 1, {
          stageId: UNKNOWN_ID,
          position: positionBetween(null, null),
          closedAt: null,
        }),
      );

      await expect(write).rejects.toBeInstanceOf(BoardChangedError);
      expect(await storedDeal(deal.id)).toMatchObject({ stageId: stages.New, version: 1 });
    });
  });

  describe('get', () => {
    it('should answer 200 with the deal when it belongs to the workspace', async () => {
      const deal = await createDeal(owner.http, dealBody());

      const response = await manager.http.get(`/api/deals/${deal.id}`);

      expect(response.status).toBe(200);
      expect(response.body).toEqual(deal);
    });

    it('should answer 404 DEAL_NOT_FOUND when the deal is in another workspace', async () => {
      const deal = await createDeal(owner.http, dealBody());

      const response = await stranger.http.get(`/api/deals/${deal.id}`);

      expect(response.status).toBe(404);
      expect(problemCode(response)).toBe('DEAL_NOT_FOUND');
    });

    it('should answer 404 when the deal is deleted', async () => {
      const deal = await createDeal(owner.http, dealBody());
      await owner.http.delete(`/api/deals/${deal.id}`).expect(204);

      await expectDealNotFound(owner.http.get(`/api/deals/${deal.id}`));
    });

    it('should answer 404 when the client of the deal is deleted', async () => {
      const deal = await createDeal(owner.http, dealBody());
      await owner.http.delete(`/api/clients/${client.id}`).expect(204);

      await expectDealNotFound(owner.http.get(`/api/deals/${deal.id}`));
    });

    it('should answer 400 on id when the id is not a UUID', async () => {
      const response = await owner.http.get('/api/deals/not-a-uuid');

      expect(response.status).toBe(400);
      expect(errorPaths(response)).toEqual(['id']);
    });
  });

  describe('edit', () => {
    let deal: Deal;

    beforeEach(async () => {
      deal = await createDeal(owner.http, dealBody());
    });

    it('should change only the sent fields and add one to the version when the edit is valid', async () => {
      const response = await manager.http
        .patch(`/api/deals/${deal.id}`)
        .send({ version: 1, amount: 99_00 });

      expect(response.status).toBe(200);
      expect(dealSchema.parse(response.body)).toMatchObject({
        title: deal.title,
        amount: 99_00,
        currency: 'USD',
        version: 2,
      });
    });

    it('should answer 200 and keep version, updated_at and history when the values are stored ones', async () => {
      const response = await owner.http.patch(`/api/deals/${deal.id}`).send({
        version: 1,
        title: deal.title,
        amount: deal.amount,
        currency: deal.currency,
        clientId: client.id,
        assigneeId: owner.session.user.id,
      });

      expect(response.status).toBe(200);
      expect(response.body).toEqual(deal);
      expect(await historyTypes(deal.id)).toEqual(['deal_created']);
    });

    it('should answer 409 DEAL_CHANGED and keep the row when the version is stale', async () => {
      await owner.http.patch(`/api/deals/${deal.id}`).send({ version: 1, title: 'First' });

      const response = await manager.http
        .patch(`/api/deals/${deal.id}`)
        .send({ version: 1, title: 'Second' });

      expect(response.status).toBe(409);
      expect(problemCode(response)).toBe('DEAL_CHANGED');
      expect(await storedDeal(deal.id)).toMatchObject({ title: 'First', version: 2 });
    });

    it('should write one updated entry with the old and new names when fields change', async () => {
      const other = await createClient(owner.http, { name: 'Lutik' });

      await owner.http
        .patch(`/api/deals/${deal.id}`)
        .send({
          version: 1,
          title: 'Shop',
          currency: 'EUR',
          clientId: other.id,
          assigneeId: manager.session.user.id,
        })
        .expect(200);

      const [entry] = (await historyOf(deal.id)).items;
      expect(entry).toMatchObject({
        type: 'deal_updated',
        payload: {
          changes: [
            { field: 'title', from: 'Landing page', to: 'Shop' },
            {
              field: 'amount',
              from: { amount: 150_000, currency: 'USD' },
              to: { amount: 150_000, currency: 'EUR' },
            },
            { field: 'client', from: { name: 'Romashka LLC' }, to: { name: 'Lutik' } },
            { field: 'assignee', from: { name: 'Ann' }, to: { name: 'Max' } },
          ],
        },
      });
      expect(await historyTypes(deal.id)).toEqual(['deal_updated', 'deal_created']);
    });

    it.each([
      ['a client of another workspace', 'clientId', 'Choose a client'],
      ['a deleted client', 'clientId', 'Choose a client'],
      ['an assignee outside the workspace', 'assigneeId', 'Choose a member'],
    ] as const)(
      'should answer 400 VALIDATION_FAILED and keep the row and history when the edit sets %s',
      async (reference, path, message) => {
        const foreignClient = await createClient(stranger.http);
        const deletedClient = await createClient(owner.http, { name: 'Gone' });
        await owner.http.delete(`/api/clients/${deletedClient.id}`).expect(204);
        const edits: Record<string, Partial<CreateDealRequest>> = {
          'a client of another workspace': { clientId: foreignClient.id },
          'a deleted client': { clientId: deletedClient.id },
          'an assignee outside the workspace': { assigneeId: stranger.session.user.id },
        };
        const before = await storedDeal(deal.id);

        const response = await owner.http
          .patch(`/api/deals/${deal.id}`)
          .send({ version: 1, ...edits[reference] });

        expect(response.status).toBe(400);
        expect(apiProblemSchema.parse(response.body)).toMatchObject({
          code: 'VALIDATION_FAILED',
          errors: [{ path, message }],
        });
        expect(await storedDeal(deal.id)).toEqual(before);
        expect(await historyTypes(deal.id)).toEqual(['deal_created']);
      },
    );

    it('should answer 404 DEAL_NOT_FOUND and keep the row when the deal is in another workspace', async () => {
      const response = await stranger.http
        .patch(`/api/deals/${deal.id}`)
        .send({ version: 1, title: 'Hijacked' });

      expect(response.status).toBe(404);
      expect(problemCode(response)).toBe('DEAL_NOT_FOUND');
      expect(await storedDeal(deal.id)).toMatchObject({ title: 'Landing page' });
    });

    it('should answer one 200 and one 409 when two edits with the same version run at once', async () => {
      const responses = await Promise.all([
        owner.http.patch(`/api/deals/${deal.id}`).send({ version: 1, title: 'Owner' }),
        manager.http.patch(`/api/deals/${deal.id}`).send({ version: 1, title: 'Manager' }),
      ]);

      expect(responses.map(({ status }) => status).toSorted()).toEqual([200, 409]);
      expect(await storedDeal(deal.id)).toMatchObject({ version: 2 });
    });
  });

  describe('delete and restore', () => {
    it('should answer 204, hide the deal and write an entry when the owner deletes a manager deal', async () => {
      const deal = await createDeal(manager.http, dealBody());

      const response = await owner.http.delete(`/api/deals/${deal.id}`);

      expect(response.status).toBe(204);
      expect(await storedDeal(deal.id)).toMatchObject({ version: 2 });
      expect((await storedDeal(deal.id))?.deletedAt).toBeInstanceOf(Date);
      expect(await boardIds()).toEqual([]);
      expect(await clientDealIds(client.id)).toEqual([]);
      const types = await prisma.activity.findMany({
        where: { dealId: deal.id },
        orderBy: { createdAt: 'desc' },
        select: { type: true },
      });
      expect(types.map(({ type }) => type)).toEqual(['deal_deleted', 'deal_created']);
    });

    it('should answer 204 when a manager deletes their own deal', async () => {
      const deal = await createDeal(manager.http, dealBody());

      await manager.http.delete(`/api/deals/${deal.id}`).expect(204);
    });

    it('should answer 403 DEAL_DELETE_FORBIDDEN and keep the row when a manager deletes the owner deal', async () => {
      const deal = await createDeal(owner.http, dealBody());

      const response = await manager.http.delete(`/api/deals/${deal.id}`);

      expect(response.status).toBe(403);
      expect(problemCode(response)).toBe('DEAL_DELETE_FORBIDDEN');
      expect((await storedDeal(deal.id))?.deletedAt).toBeNull();
    });

    it('should answer 404 when the deal is deleted again', async () => {
      const deal = await createDeal(owner.http, dealBody());
      await owner.http.delete(`/api/deals/${deal.id}`).expect(204);

      await expectDealNotFound(owner.http.delete(`/api/deals/${deal.id}`));
    });

    it('should answer 404 and keep the row when the deal is in another workspace', async () => {
      const deal = await createDeal(owner.http, dealBody());

      await expectDealNotFound(stranger.http.delete(`/api/deals/${deal.id}`));
      expect((await storedDeal(deal.id))?.deletedAt).toBeNull();
    });

    it('should answer 200, write an entry and put the deal back when a deleted deal is restored', async () => {
      const deal = await createDeal(owner.http, dealBody());
      await owner.http.delete(`/api/deals/${deal.id}`).expect(204);

      const response = await owner.http.post(`/api/deals/${deal.id}/restore`);

      expect(response.status).toBe(200);
      expect(dealSchema.parse(response.body)).toMatchObject({ id: deal.id, version: 3 });
      expect(await boardIds()).toEqual([deal.id]);
      expect(await historyTypes(deal.id)).toEqual([
        'deal_restored',
        'deal_deleted',
        'deal_created',
      ]);
    });

    it('should answer 200 with the deal unchanged when it is active', async () => {
      const deal = await createDeal(owner.http, dealBody());

      const response = await owner.http.post(`/api/deals/${deal.id}/restore`);

      expect(response.status).toBe(200);
      expect(response.body).toEqual(deal);
      expect(await historyTypes(deal.id)).toEqual(['deal_created']);
    });

    it('should answer 403 and keep the deal deleted without an entry when a manager restores the owner deleted deal', async () => {
      const deal = await createDeal(owner.http, dealBody());
      await owner.http.delete(`/api/deals/${deal.id}`).expect(204);

      const response = await manager.http.post(`/api/deals/${deal.id}/restore`);

      expect(response.status).toBe(403);
      expect(problemCode(response)).toBe('DEAL_DELETE_FORBIDDEN');
      const stored = await storedDeal(deal.id);
      expect(stored).toMatchObject({ version: 2 });
      expect(stored?.deletedAt).toBeInstanceOf(Date);
      const entries = await prisma.activity.count({
        where: { dealId: deal.id, type: 'deal_restored' },
      });
      expect(entries).toBe(0);
    });

    it('should answer 404 when the deal is in another workspace', async () => {
      const deal = await createDeal(owner.http, dealBody());
      await owner.http.delete(`/api/deals/${deal.id}`).expect(204);

      await expectDealNotFound(stranger.http.post(`/api/deals/${deal.id}/restore`));
      expect((await storedDeal(deal.id))?.deletedAt).toBeInstanceOf(Date);
    });

    it('should answer 404 when the client of the deleted deal is deleted', async () => {
      const deal = await createDeal(owner.http, dealBody());
      await owner.http.delete(`/api/deals/${deal.id}`).expect(204);
      await owner.http.delete(`/api/clients/${client.id}`).expect(204);

      await expectDealNotFound(owner.http.post(`/api/deals/${deal.id}/restore`));
    });
  });

  describe('client deletion', () => {
    it('should hide the deals and bring them back unchanged when the client is deleted and restored', async () => {
      const deal = await createDeal(owner.http, dealBody());

      await owner.http.delete(`/api/clients/${client.id}`).expect(204);

      expect(await boardIds()).toEqual([]);
      expect(await clientDealIds(client.id)).toEqual([]);
      await expectDealNotFound(owner.http.get(`/api/deals/${deal.id}/history`));
      await expectDealNotFound(
        owner.http.patch(`/api/deals/${deal.id}`).send({ version: 1, title: 'X' }),
      );
      await owner.http.post(`/api/clients/${client.id}/restore`).expect(200);
      const response = await owner.http.get(`/api/deals/${deal.id}`).expect(200);
      expect(response.body).toEqual(deal);
      expect(await boardIds()).toEqual([deal.id]);
    });

    it('should answer 404 and keep the row when a deal of a deleted client is moved', async () => {
      const deal = await createDeal(owner.http, dealBody());
      await owner.http.delete(`/api/clients/${client.id}`).expect(204);

      await expectDealNotFound(
        owner.http
          .post(`/api/deals/${deal.id}/move`)
          .send({ version: 1, stageId: stages.Call, afterId: null }),
      );
      expect(await storedDeal(deal.id)).toMatchObject({ stageId: stages.New, version: 1 });
    });

    it('should answer 404 and keep the row when a deal of a deleted client is deleted', async () => {
      const deal = await createDeal(owner.http, dealBody());
      await owner.http.delete(`/api/clients/${client.id}`).expect(204);

      await expectDealNotFound(owner.http.delete(`/api/deals/${deal.id}`));
      expect(await storedDeal(deal.id)).toMatchObject({ deletedAt: null, version: 1 });
    });
  });

  describe('history', () => {
    it('should keep the old stage name in the entry when the stage is renamed after a move', async () => {
      const deal = await createDeal(owner.http, dealBody());
      await moveDeal(owner.http, deal.id, { version: 1, stageId: stages.Call, afterId: null });

      await owner.http.patch(`/api/stages/${stages.Call}`).send({ name: 'Discovery' }).expect(200);

      const [moved] = (await historyOf(deal.id)).items;
      expect(moved).toMatchObject({
        type: 'deal_moved',
        payload: { from: { name: 'New' }, to: { name: 'Call' } },
      });
    });

    it('should list the newest 100 entries and hasMore when the deal has 101', async () => {
      const deal = await createDeal(owner.http, dealBody());
      await insertActivities(
        testApp,
        owner.session.workspace.id,
        deal.id,
        owner.session.user.id,
        Array.from({ length: 100 }, (_, index) => ({
          type: 'deal_deleted' as const,
          payload: {},
          createdAt: new Date(Date.UTC(2020, 0, 1, 0, index)),
        })),
      );

      const history = await historyOf(deal.id);

      expect(history.items).toHaveLength(100);
      expect(history.hasMore).toBe(true);
      expect(history.items[0]?.type).toBe('deal_created');
      const times = history.items.map(({ createdAt }) => Date.parse(createdAt));
      expect(times).toEqual(times.toSorted((a, b) => b - a));
    });

    it('should answer 404 when the deal is in another workspace', async () => {
      const deal = await createDeal(owner.http, dealBody());

      await expectDealNotFound(stranger.http.get(`/api/deals/${deal.id}/history`));
    });
  });

  describe("client's deals", () => {
    it('should list only the visible deals of that client, newest first, when the client deals are read', async () => {
      const other = await createClient(owner.http, { name: 'Lutik' });
      const first = await createDeal(owner.http, dealBody({ title: 'First' }));
      const second = await createDeal(owner.http, dealBody({ title: 'Second' }));
      const deleted = await createDeal(owner.http, dealBody({ title: 'Deleted' }));
      await createDeal(owner.http, dealBody({ clientId: other.id }));
      await owner.http.delete(`/api/deals/${deleted.id}`).expect(204);

      expect(await clientDealIds(client.id)).toEqual([second.id, first.id]);
    });

    it('should answer an empty list when the client is in another workspace', async () => {
      await createDeal(owner.http, dealBody());

      expect(await clientDealIds(client.id, stranger)).toEqual([]);
    });

    it('should answer 400 on clientId when it is missing', async () => {
      const response = await owner.http.get('/api/deals');

      expect(response.status).toBe(400);
      expect(errorPaths(response)).toEqual(['clientId']);
    });
  });

  describe('access', () => {
    it.each([
      ['get', '/api/deals/board'],
      ['get', `/api/deals?clientId=${UNKNOWN_ID}`],
      ['post', '/api/deals'],
      ['get', `/api/deals/${UNKNOWN_ID}`],
      ['patch', `/api/deals/${UNKNOWN_ID}`],
      ['post', `/api/deals/${UNKNOWN_ID}/move`],
      ['delete', `/api/deals/${UNKNOWN_ID}`],
      ['post', `/api/deals/${UNKNOWN_ID}/restore`],
      ['get', `/api/deals/${UNKNOWN_ID}/history`],
      ['get', '/api/stages'],
      ['post', '/api/stages'],
      ['patch', `/api/stages/${UNKNOWN_ID}`],
      ['put', '/api/stages/order'],
      ['delete', `/api/stages/${UNKNOWN_ID}`],
      ['get', '/api/members'],
    ] as const)('should answer 401 when %s %s gets no access cookie', async (method, path) => {
      const response = await send()[method](path);

      expect(response.status).toBe(401);
      expect(problemCode(response)).toBe('AUTHENTICATION_REQUIRED');
    });

    it.each([
      ['post', '/api/deals'],
      ['patch', `/api/deals/${UNKNOWN_ID}`],
      ['post', `/api/deals/${UNKNOWN_ID}/move`],
      ['delete', `/api/deals/${UNKNOWN_ID}`],
      ['post', `/api/deals/${UNKNOWN_ID}/restore`],
      ['post', '/api/stages'],
      ['patch', `/api/stages/${UNKNOWN_ID}`],
      ['put', '/api/stages/order'],
      ['delete', `/api/stages/${UNKNOWN_ID}`],
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
    it('should give deals.position the C collation when migrations ran', async () => {
      const [column] = await prisma.$queryRaw<{ collation: string | null }[]>`
        SELECT collation_name AS collation FROM information_schema.columns
        WHERE table_name = 'deals' AND column_name = 'position'`;

      expect(column?.collation).toBe('C');
    });

    it('should make the deal and activity references inside a workspace NO ACTION when migrations ran', async () => {
      const rules = await prisma.$queryRaw<{ name: string; rule: string }[]>`
        SELECT constraint_name AS name, delete_rule AS rule
        FROM information_schema.referential_constraints
        WHERE constraint_name IN
          ('deals_client_id_fkey', 'deals_stage_id_fkey', 'activities_deal_id_fkey')
        ORDER BY constraint_name`;

      expect(rules).toEqual([
        { name: 'activities_deal_id_fkey', rule: 'NO ACTION' },
        { name: 'deals_client_id_fkey', rule: 'NO ACTION' },
        { name: 'deals_stage_id_fkey', rule: 'NO ACTION' },
      ]);
    });
  });
});
