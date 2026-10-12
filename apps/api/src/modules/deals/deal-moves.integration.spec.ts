import type { Response } from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, onTestFinished } from 'vitest';

import type { Client } from '@clientry/shared/clients';
import { apiProblemSchema } from '@clientry/shared/common';
import { boardResponseSchema, dealHistoryResponseSchema } from '@clientry/shared/deals';
import type { Board, BoardColumn, CreateDealRequest, Deal } from '@clientry/shared/deals';

import { positionsAfter } from './deal-position.js';
import { createTestApp } from '../../../test/create-test-app.js';
import type { TestApp } from '../../../test/create-test-app.js';
import { addManager, registerAccount } from '../../../test/fixtures/accounts.js';
import type { TestAccount } from '../../../test/fixtures/accounts.js';
import { createClient } from '../../../test/fixtures/clients.js';
import { createDeal, findStageIds, insertDeals, moveDeal } from '../../../test/fixtures/deals.js';
import type { DealSeed, StageIds } from '../../../test/fixtures/deals.js';
import { resetDatabase } from '../../../test/reset-database.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';

function problemCode(response: Response): string {
  return apiProblemSchema.parse(response.body).code;
}

describe('deal moves and board API', () => {
  let testApp: TestApp;
  let prisma: PrismaService;
  let owner: TestAccount;
  let manager: TestAccount;
  let stages: StageIds;
  let client: Client;
  let workspaceId: string;

  function dealBody(overrides: Partial<CreateDealRequest> = {}): CreateDealRequest {
    return {
      title: 'Deal',
      clientId: client.id,
      stageId: stages.New,
      amount: 100_00,
      currency: 'USD',
      assigneeId: owner.session.user.id,
      ...overrides,
    };
  }

  async function board(query = '', account = owner): Promise<Board> {
    const response = await account.http.get(`/api/deals/board${query}`).expect(200);
    return boardResponseSchema.parse(response.body);
  }

  async function column(stageId: string, query = '', account = owner): Promise<BoardColumn> {
    const found = (await board(query, account)).columns.find(({ stage }) => stage.id === stageId);
    if (!found) {
      throw new Error(`Stage ${stageId} is not on the board`);
    }
    return found;
  }

  async function titles(stageId: string): Promise<string[]> {
    return (await column(stageId)).deals.map(({ title }) => title);
  }

  async function createInOrder(names: readonly string[], stageId = stages.New): Promise<Deal[]> {
    const deals: Deal[] = [];
    for (const title of names.toReversed()) {
      deals.unshift(await createDeal(owner.http, dealBody({ title, stageId })));
    }
    return deals;
  }

  async function historyTypes(id: string): Promise<string[]> {
    const response = await owner.http.get(`/api/deals/${id}/history`).expect(200);
    return dealHistoryResponseSchema.parse(response.body).items.map(({ type }) => type);
  }

  function seeds(count: number, seed: Omit<DealSeed, 'position'>): DealSeed[] {
    return positionsAfter(null, count).map((position) => ({ ...seed, position }));
  }

  beforeAll(async () => {
    testApp = await createTestApp();
    prisma = testApp.app.get(PrismaService);
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
    owner = await registerAccount(testApp, 'Pixel Studio');
    workspaceId = owner.session.workspace.id;
    manager = await addManager(testApp, workspaceId);
    stages = await findStageIds(testApp, workspaceId);
    client = await createClient(owner.http, { name: 'Romashka LLC' });
  });

  afterAll(async () => {
    await testApp.app.close();
  });

  describe('move', () => {
    it('should put the card right after another one when both are in the same column', async () => {
      const [a, b, c] = await createInOrder(['A', 'B', 'C']);

      await moveDeal(owner.http, c?.id ?? '', {
        version: 1,
        stageId: stages.New,
        afterId: a?.id ?? null,
      });

      expect(await titles(stages.New)).toEqual(['A', 'C', 'B']);
      expect(await historyTypes(b?.id ?? '')).toEqual(['deal_created']);
      expect(await historyTypes(c?.id ?? '')).toEqual(['deal_created']);
    });

    it('should put the card first when afterId is null', async () => {
      const [, , c] = await createInOrder(['A', 'B', 'C']);

      const moved = await moveDeal(owner.http, c?.id ?? '', {
        version: 1,
        stageId: stages.New,
        afterId: null,
      });

      expect(moved.version).toBe(2);
      expect(await titles(stages.New)).toEqual(['C', 'A', 'B']);
    });

    it('should move the card and write a moved entry when the target is another stage', async () => {
      const [deal] = await createInOrder(['A']);

      const moved = await moveDeal(manager.http, deal?.id ?? '', {
        version: 1,
        stageId: stages.Call,
        afterId: null,
      });

      expect(moved.stage).toEqual({ id: stages.Call, name: 'Call', kind: 'open' });
      expect(await titles(stages.Call)).toEqual(['A']);
      expect(await historyTypes(moved.id)).toEqual(['deal_moved', 'deal_created']);
    });

    it('should set closedAt again when the deal goes from won to lost and clear it when it reopens', async () => {
      const deal = await createDeal(owner.http, dealBody());

      const won = await moveDeal(owner.http, deal.id, {
        version: 1,
        stageId: stages.Paid,
        afterId: null,
      });
      // An old close date, so a lost deal that kept it would show.
      const wonLongAgo = new Date('2026-01-01T00:00:00.000Z');
      await prisma.deal.update({ where: { id: deal.id }, data: { closedAt: wonLongAgo } });
      const lost = await moveDeal(owner.http, deal.id, {
        version: 2,
        stageId: stages.Lost,
        afterId: null,
      });
      const reopened = await moveDeal(owner.http, deal.id, {
        version: 3,
        stageId: stages.Call,
        afterId: null,
      });

      expect(won.closedAt).not.toBeNull();
      expect(Date.parse(lost.closedAt ?? '')).toBeGreaterThan(wonLongAgo.getTime());
      expect(reopened.closedAt).toBeNull();
    });

    it.each(['from another stage', 'from another workspace', 'deleted'])(
      'should answer 409 BOARD_CHANGED and change nothing when afterId is a deal %s',
      async (kind) => {
        const deal = await createDeal(owner.http, dealBody());
        const stranger = await registerAccount(testApp, 'Other Studio');
        const strangerStages = await findStageIds(testApp, stranger.session.workspace.id);
        const strangerClient = await createClient(stranger.http);
        const neighbours: Record<string, () => Promise<string>> = {
          'from another stage': async () =>
            (await createDeal(owner.http, dealBody({ stageId: stages.Call }))).id,
          'from another workspace': async () =>
            (
              await createDeal(stranger.http, {
                ...dealBody({ clientId: strangerClient.id, stageId: strangerStages.New }),
                assigneeId: stranger.session.user.id,
              })
            ).id,
          deleted: async () => {
            const gone = await createDeal(owner.http, dealBody());
            await owner.http.delete(`/api/deals/${gone.id}`).expect(204);
            return gone.id;
          },
        };
        const afterId = await (neighbours[kind] ?? (() => Promise.resolve('')))();

        const response = await owner.http
          .post(`/api/deals/${deal.id}/move`)
          .send({ version: 1, stageId: stages.New, afterId });

        expect(response.status).toBe(409);
        expect(problemCode(response)).toBe('BOARD_CHANGED');
        expect(await prisma.deal.findUnique({ where: { id: deal.id } })).toMatchObject({
          version: 1,
          stageId: stages.New,
        });
      },
    );

    it('should answer 409 BOARD_CHANGED when the stage is in another workspace or afterId is the deal', async () => {
      const deal = await createDeal(owner.http, dealBody());
      const stranger = await registerAccount(testApp, 'Other Studio');
      const strangerStages = await findStageIds(testApp, stranger.session.workspace.id);

      const foreign = await owner.http
        .post(`/api/deals/${deal.id}/move`)
        .send({ version: 1, stageId: strangerStages.New, afterId: null });
      const itself = await owner.http
        .post(`/api/deals/${deal.id}/move`)
        .send({ version: 1, stageId: stages.New, afterId: deal.id });

      expect([problemCode(foreign), problemCode(itself)]).toEqual([
        'BOARD_CHANGED',
        'BOARD_CHANGED',
      ]);
      expect(
        await prisma.deal.findUnique({
          where: { id: deal.id },
          select: { stageId: true, version: true },
        }),
      ).toEqual({ stageId: stages.New, version: 1 });
    });

    it('should answer 409 DEAL_CHANGED when the version is stale', async () => {
      const deal = await createDeal(owner.http, dealBody());
      await moveDeal(owner.http, deal.id, { version: 1, stageId: stages.Call, afterId: null });

      const response = await manager.http
        .post(`/api/deals/${deal.id}/move`)
        .send({ version: 1, stageId: stages.Contract, afterId: null });

      expect(response.status).toBe(409);
      expect(problemCode(response)).toBe('DEAL_CHANGED');
    });

    it('should answer 404 DEAL_NOT_FOUND and change nothing when the deal is in another workspace', async () => {
      const deal = await createDeal(owner.http, dealBody());
      const stranger = await registerAccount(testApp, 'Other Studio');
      const placement = { stageId: true, position: true, version: true } as const;
      const before = await prisma.deal.findUniqueOrThrow({
        where: { id: deal.id },
        select: placement,
      });

      const response = await stranger.http
        .post(`/api/deals/${deal.id}/move`)
        .send({ version: 1, stageId: stages.Call, afterId: null });

      expect(response.status).toBe(404);
      expect(problemCode(response)).toBe('DEAL_NOT_FOUND');
      expect(
        await prisma.deal.findUniqueOrThrow({ where: { id: deal.id }, select: placement }),
      ).toEqual(before);
    });

    it('should keep the order when 50 cards in turn go between the same two neighbours', async () => {
      const [first, , ...movers] = await createInOrder([
        'first',
        'last',
        ...Array.from({ length: 50 }, (_, index) => `m${String(index)}`),
      ]);

      for (const mover of movers) {
        await moveDeal(owner.http, mover.id, {
          version: 1,
          stageId: stages.New,
          afterId: first?.id ?? null,
        });
      }

      const expected = movers.map(({ title }) => title).toReversed();
      expect(await titles(stages.New)).toEqual(['first', ...expected, 'last']);
    });

    it('should place the card after equal keys when neighbours share a position', async () => {
      const [position = ''] = positionsAfter(null, 1);
      const [twinA, twinB, mover] = await insertDeals(testApp, workspaceId, [
        {
          clientId: client.id,
          stageId: stages.New,
          createdById: owner.session.user.id,
          position,
          title: 'A',
        },
        {
          clientId: client.id,
          stageId: stages.New,
          createdById: owner.session.user.id,
          position,
          title: 'B',
        },
        {
          clientId: client.id,
          stageId: stages.Call,
          createdById: owner.session.user.id,
          position,
          title: 'M',
        },
      ]);
      const twins = [twinA, twinB].toSorted();

      await moveDeal(owner.http, mover ?? '', {
        version: 1,
        stageId: stages.New,
        afterId: twins[0] ?? null,
      });

      const ids = (await column(stages.New)).deals.map(({ id }) => id);
      expect(ids).toEqual([...twins, mover]);
    });

    it('should bring the deal back to its place in the column when it is deleted and restored', async () => {
      const [, b] = await createInOrder(['A', 'B', 'C']);
      await owner.http.delete(`/api/deals/${b?.id ?? ''}`).expect(204);
      await createDeal(owner.http, dealBody({ title: 'Top' }));

      await owner.http.post(`/api/deals/${b?.id ?? ''}/restore`).expect(200);

      expect(await titles(stages.New)).toEqual(['Top', 'A', 'B', 'C']);
    });

    it('should answer one 200, one 409 and write one entry when two moves with one version run at once', async () => {
      const deal = await createDeal(owner.http, dealBody());

      const responses = await Promise.all([
        owner.http
          .post(`/api/deals/${deal.id}/move`)
          .send({ version: 1, stageId: stages.Call, afterId: null }),
        manager.http
          .post(`/api/deals/${deal.id}/move`)
          .send({ version: 1, stageId: stages.Contract, afterId: null }),
      ]);

      expect(responses.map(({ status }) => status).toSorted()).toEqual([200, 409]);
      expect(await historyTypes(deal.id)).toEqual(['deal_moved', 'deal_created']);
    });
  });

  describe('board', () => {
    it('should list every stage in order with empty columns when the workspace has no deals', async () => {
      const { columns } = await board();

      expect(columns.map(({ stage }) => stage.name)).toEqual([
        'New',
        'Call',
        'Proposal sent',
        'Contract',
        'Paid',
        'Lost',
      ]);
      expect(
        columns.every(
          ({ deals, count, totals }) => deals.length === 0 && count === 0 && totals.length === 0,
        ),
      ).toBe(true);
    });

    it('should order the cards by closedAt, newest first, when the column is closed', async () => {
      const userId = owner.session.user.id;
      const closedPositions = positionsAfter(null, 3);
      await insertDeals(testApp, workspaceId, [
        {
          clientId: client.id,
          stageId: stages.Paid,
          createdById: userId,
          position: closedPositions[0] ?? '',
          title: 'Old',
          closedAt: new Date('2026-10-01T00:00:00Z'),
        },
        {
          clientId: client.id,
          stageId: stages.Paid,
          createdById: userId,
          position: closedPositions[1] ?? '',
          title: 'New',
          closedAt: new Date('2026-10-05T00:00:00Z'),
        },
        {
          clientId: client.id,
          stageId: stages.Paid,
          createdById: userId,
          position: closedPositions[2] ?? '',
          title: 'Mid',
          closedAt: new Date('2026-10-03T00:00:00Z'),
        },
      ]);

      expect(await titles(stages.Paid)).toEqual(['New', 'Mid', 'Old']);
    });

    it('should return the first 100 cards but count and total all 101 when a column has 101 deals', async () => {
      const ordered = seeds(101, {
        clientId: client.id,
        stageId: stages.New,
        createdById: owner.session.user.id,
        amount: 10_00,
      });
      // Inserted last first, so the creation order cannot pass for the position order.
      const ids = await insertDeals(testApp, workspaceId, [...ordered].reverse());

      const result = await column(stages.New);

      expect(result.deals.map(({ id }) => id)).toEqual([...ids].reverse().slice(0, 100));
      expect(result.count).toBe(101);
      expect(result.totals).toEqual([{ currency: 'USD', amount: 101_000, count: 101 }]);
    });

    it('should total per currency when a column holds several currencies', async () => {
      await createDeal(owner.http, dealBody({ amount: 150_000, currency: 'USD' }));
      await createDeal(owner.http, dealBody({ amount: 300_000, currency: 'USD' }));
      await createDeal(owner.http, dealBody({ amount: 120_000, currency: 'EUR' }));

      expect((await column(stages.New)).totals).toEqual([
        { currency: 'USD', amount: 450_000, count: 2 },
        { currency: 'EUR', amount: 120_000, count: 1 },
      ]);
    });

    it('should leave deleted deals, deals of deleted clients and other workspaces out of cards, counts and totals when the board is read', async () => {
      const kept = await createDeal(owner.http, dealBody({ title: 'Kept' }));
      const deleted = await createDeal(owner.http, dealBody({ title: 'Deleted' }));
      await owner.http.delete(`/api/deals/${deleted.id}`).expect(204);
      const gone = await createClient(owner.http, { name: 'Gone' });
      await createDeal(owner.http, dealBody({ title: 'Hidden', clientId: gone.id }));
      await owner.http.delete(`/api/clients/${gone.id}`).expect(204);
      const stranger = await registerAccount(testApp, 'Other Studio');
      const strangerStages = await findStageIds(testApp, stranger.session.workspace.id);
      const strangerClient = await createClient(stranger.http);
      await createDeal(stranger.http, {
        ...dealBody({ clientId: strangerClient.id, stageId: strangerStages.New }),
        assigneeId: stranger.session.user.id,
      });

      const result = await column(stages.New);

      expect(result.deals.map(({ id }) => id)).toEqual([kept.id]);
      expect(result.count).toBe(1);
      expect(result.totals).toEqual([{ currency: 'USD', amount: 100_00, count: 1 }]);
    });

    it('should show only its own stages as columns when another workspace has its own', async () => {
      await registerAccount(testApp, 'Other Studio');

      const result = await board();

      expect(result.columns.map(({ stage }) => stage.id)).toEqual([
        stages.New,
        stages.Call,
        stages['Proposal sent'],
        stages.Contract,
        stages.Paid,
        stages.Lost,
      ]);
    });

    it('should issue as many SQL statements as for one deal when 30 deals sit over six stages with three assignees', async () => {
      const other = await addManager(testApp, workspaceId);
      const assignees = [owner, manager, other].map(({ session }) => session.user.id);
      const stageIds = Object.values(stages);
      await createDeal(owner.http, dealBody());
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

      await board();
      // The rest is the session check of the access guard.
      const dealStatements = statements.filter((query) => query.includes('deals'));
      const forOne = statements.splice(0).length;
      await insertDeals(
        testApp,
        workspaceId,
        positionsAfter(null, 29).map((position, index) => ({
          clientId: client.id,
          stageId: stageIds[index % stageIds.length] ?? stages.New,
          createdById: owner.session.user.id,
          assigneeId: assignees[index % assignees.length],
          closedAt: new Date(),
          position,
        })),
      );
      statements.splice(0);
      await board();
      const forThirty = statements.splice(0).length;

      expect(forThirty).toBe(forOne);
      expect(dealStatements).toHaveLength(2);
    });
  });

  describe('board for the caller', () => {
    beforeEach(async () => {
      await createDeal(owner.http, dealBody({ title: 'Owner own', amount: 1_00 }));
      await createDeal(
        owner.http,
        dealBody({ title: 'For manager', amount: 2_00, assigneeId: manager.session.user.id }),
      );
      await createDeal(manager.http, dealBody({ title: 'Manager for owner', amount: 4_00 }));
    });

    it('should keep the deals assigned to the owner, including ones the manager created, when only mine is asked', async () => {
      const result = await column(stages.New, '?assignee=me');

      expect(result.deals.map(({ title }) => title)).toEqual(['Manager for owner', 'Owner own']);
      expect(result.count).toBe(2);
      expect(result.totals).toEqual([{ currency: 'USD', amount: 5_00, count: 2 }]);
    });

    it('should keep only the deals assigned to the manager when a manager asks', async () => {
      const result = await column(stages.New, '?assignee=me', manager);

      expect(result.deals.map(({ title }) => title)).toEqual(['For manager']);
      expect(result.totals).toEqual([{ currency: 'USD', amount: 2_00, count: 1 }]);
    });

    it('should answer 400 on assignee when it is not me', async () => {
      const response = await owner.http.get('/api/deals/board?assignee=someone');

      expect(response.status).toBe(400);
      expect(apiProblemSchema.parse(response.body).errors?.map(({ path }) => path)).toEqual([
        'assignee',
      ]);
    });
  });
});
