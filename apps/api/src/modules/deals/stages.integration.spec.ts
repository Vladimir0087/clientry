import type { Response } from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { Client } from '@clientry/shared/clients';
import { apiProblemSchema } from '@clientry/shared/common';
import { boardResponseSchema, stageListResponseSchema, stageSchema } from '@clientry/shared/deals';
import type { CreateDealRequest, StageListItem } from '@clientry/shared/deals';

import { positionBetween } from './deal-position.js';
import { StagesRepository } from './stages.repository.js';
import { createTestApp } from '../../../test/create-test-app.js';
import type { TestApp } from '../../../test/create-test-app.js';
import { addManager, registerAccount } from '../../../test/fixtures/accounts.js';
import type { TestAccount } from '../../../test/fixtures/accounts.js';
import { createClient } from '../../../test/fixtures/clients.js';
import { createDeal, findStageIds } from '../../../test/fixtures/deals.js';
import type { DefaultStageName, StageIds } from '../../../test/fixtures/deals.js';
import { resetDatabase } from '../../../test/reset-database.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';

function problemCode(response: Response): string {
  return apiProblemSchema.parse(response.body).code;
}

function errorPaths(response: Response): string[] {
  return (apiProblemSchema.parse(response.body).errors ?? []).map(({ path }) => path);
}

interface StoredStage {
  readonly name: string;
  readonly position: number;
  readonly kind: string;
}

describe('stages API', () => {
  let testApp: TestApp;
  let prisma: PrismaService;
  let owner: TestAccount;
  let manager: TestAccount;
  let stages: StageIds;
  let client: Client;

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

  async function list(account = owner): Promise<StageListItem[]> {
    const response = await account.http.get('/api/stages').expect(200);
    return stageListResponseSchema.parse(response.body).items;
  }

  async function stored(): Promise<StoredStage[]> {
    return prisma.stage.findMany({
      where: { workspaceId: owner.session.workspace.id },
      orderBy: { position: 'asc' },
      select: { name: true, position: true, kind: true },
    });
  }

  async function addStage(name: string): Promise<Response> {
    return owner.http.post('/api/stages').send({ name });
  }

  beforeAll(async () => {
    testApp = await createTestApp();
    prisma = testApp.app.get(PrismaService);
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
    owner = await registerAccount(testApp, 'Pixel Studio');
    manager = await addManager(testApp, owner.session.workspace.id);
    stages = await findStageIds(testApp, owner.session.workspace.id);
    client = await createClient(owner.http, { name: 'Romashka LLC' });
  });

  afterAll(async () => {
    await testApp.app.close();
  });

  describe('list', () => {
    it('should list the stages in board order with their visible deal counts when a manager asks', async () => {
      await createDeal(owner.http, dealBody());
      const deleted = await createDeal(owner.http, dealBody());
      await owner.http.delete(`/api/deals/${deleted.id}`).expect(204);
      const goneClient = await createClient(owner.http, { name: 'Gone' });
      await createDeal(owner.http, dealBody({ clientId: goneClient.id }));
      await owner.http.delete(`/api/clients/${goneClient.id}`).expect(204);
      await createDeal(owner.http, dealBody({ stageId: stages.Paid }));

      const items = await list(manager);

      expect(items.map(({ name, kind, dealCount }) => [name, kind, dealCount])).toEqual([
        ['New', 'open', 1],
        ['Call', 'open', 0],
        ['Proposal sent', 'open', 0],
        ['Contract', 'open', 0],
        ['Paid', 'won', 1],
        ['Lost', 'lost', 0],
      ]);
    });
  });

  describe('isolation', () => {
    const NAMES: readonly DefaultStageName[] = [
      'New',
      'Call',
      'Proposal sent',
      'Contract',
      'Paid',
      'Lost',
    ];

    it('should list only its own stages and counts when another workspace has stages and deals', async () => {
      const stranger = await registerAccount(testApp, 'Other Studio');
      const foreign = await findStageIds(testApp, stranger.session.workspace.id);
      const strangerClient = await createClient(stranger.http);
      await createDeal(stranger.http, {
        ...dealBody({ clientId: strangerClient.id, stageId: foreign.New }),
        assigneeId: stranger.session.user.id,
      });

      const items = await list(owner);

      expect(items.map(({ id }) => id)).toEqual(NAMES.map((name) => stages[name]));
      expect(items.map(({ dealCount }) => dealCount)).toEqual([0, 0, 0, 0, 0, 0]);
    });

    it('should answer 409 STAGES_CHANGED and keep both orders when a reorder sends another workspace stages', async () => {
      const stranger = await registerAccount(testApp, 'Other Studio');
      const foreign = await findStageIds(testApp, stranger.session.workspace.id);

      const response = await owner.http
        .put('/api/stages/order')
        .send({ ids: [foreign.Contract, foreign['Proposal sent'], foreign.Call, foreign.New] });

      expect(response.status).toBe(409);
      expect(problemCode(response)).toBe('STAGES_CHANGED');
      expect((await stored()).map(({ name }) => name)).toEqual(NAMES);
      const theirs = await prisma.stage.findMany({
        where: { workspaceId: stranger.session.workspace.id },
        orderBy: { position: 'asc' },
        select: { name: true },
      });
      expect(theirs.map(({ name }) => name)).toEqual(NAMES);
    });
  });

  describe('roles', () => {
    it.each([
      ['post', '/api/stages', { name: 'Demo' }],
      ['patch', '/api/stages/:id', { name: 'Renamed' }],
      ['put', '/api/stages/order', { ids: [] }],
      ['delete', '/api/stages/:id?moveDealsTo=:target', undefined],
    ] as const)(
      'should answer 403 INSUFFICIENT_ROLE and change nothing when a manager calls %s %s',
      async (method, path, body) => {
        const url = path.replace(':id', stages.New).replace(':target', stages.Call);

        const response = await manager.http[method](url).send(body);

        expect(response.status).toBe(403);
        expect(problemCode(response)).toBe('INSUFFICIENT_ROLE');
        expect((await stored()).map(({ name }) => name)).toEqual([
          'New',
          'Call',
          'Proposal sent',
          'Contract',
          'Paid',
          'Lost',
        ]);
      },
    );
  });

  describe('create', () => {
    it('should answer 201 and put the stage before won with contiguous positions when a stage is added', async () => {
      const response = await addStage('  Demo  ');

      expect(response.status).toBe(201);
      expect(stageSchema.parse(response.body)).toMatchObject({ name: 'Demo', kind: 'open' });
      expect(await stored()).toEqual([
        { name: 'New', position: 0, kind: 'open' },
        { name: 'Call', position: 1, kind: 'open' },
        { name: 'Proposal sent', position: 2, kind: 'open' },
        { name: 'Contract', position: 3, kind: 'open' },
        { name: 'Demo', position: 4, kind: 'open' },
        { name: 'Paid', position: 5, kind: 'won' },
        { name: 'Lost', position: 6, kind: 'lost' },
      ]);
    });

    it('should answer 409 STAGE_LIMIT_REACHED when an 11th open stage is added', async () => {
      for (let index = 0; index < 6; index += 1) {
        await addStage(`Extra ${String(index)}`).then(({ status }) => {
          expect(status).toBe(201);
        });
      }

      const response = await addStage('Eleventh');

      expect(response.status).toBe(409);
      expect(problemCode(response)).toBe('STAGE_LIMIT_REACHED');
    });

    it('should answer 409 STAGE_NAME_TAKEN when the name differs from a stage only in case', async () => {
      const response = await addStage('cALL');

      expect(response.status).toBe(409);
      expect(problemCode(response)).toBe('STAGE_NAME_TAKEN');
    });

    it('should answer one 201 and one 409 when two owners add the same name at once', async () => {
      const responses = await Promise.all([addStage('Demo'), addStage('demo')]);

      expect(responses.map(({ status }) => status).toSorted()).toEqual([201, 409]);
      expect(await stored()).toHaveLength(7);
    });
  });

  describe('rename', () => {
    it('should answer 200 with the new name when the stage is renamed', async () => {
      const response = await owner.http.patch(`/api/stages/${stages.Paid}`).send({ name: 'Won' });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ id: stages.Paid, name: 'Won', kind: 'won' });
    });

    it('should answer 200 when the stage takes its own name in another case', async () => {
      await owner.http.patch(`/api/stages/${stages.Call}`).send({ name: 'CALL' }).expect(200);
    });

    it('should find the stage when its id is sent in uppercase', async () => {
      await owner.http
        .patch(`/api/stages/${stages.Paid.toUpperCase()}`)
        .send({ name: 'Won' })
        .expect(200);
    });

    it('should answer 409 STAGE_NAME_TAKEN when another stage has the name', async () => {
      const response = await owner.http.patch(`/api/stages/${stages.Call}`).send({ name: 'new' });

      expect(response.status).toBe(409);
      expect(problemCode(response)).toBe('STAGE_NAME_TAKEN');
    });

    it('should answer 404 STAGE_NOT_FOUND and keep the name when the stage is in another workspace', async () => {
      const stranger = await registerAccount(testApp, 'Other Studio');

      const response = await stranger.http.patch(`/api/stages/${stages.Call}`).send({ name: 'X' });

      expect(response.status).toBe(404);
      expect(problemCode(response)).toBe('STAGE_NOT_FOUND');
      expect(
        await prisma.stage.findUniqueOrThrow({
          where: { id: stages.Call },
          select: { name: true },
        }),
      ).toEqual({ name: 'Call' });
    });
  });

  describe('reorder', () => {
    it('should answer 200 with the new order and make the board follow it when the stages are reordered', async () => {
      const ids = [stages.Contract, stages.New, stages['Proposal sent'], stages.Call];

      const response = await owner.http.put('/api/stages/order').send({ ids });

      expect(response.status).toBe(200);
      const names = stageListResponseSchema.parse(response.body).items.map(({ name }) => name);
      expect(names).toEqual(['Contract', 'New', 'Proposal sent', 'Call', 'Paid', 'Lost']);
      const board = boardResponseSchema.parse(
        (await owner.http.get('/api/deals/board').expect(200)).body,
      );
      expect(board.columns.map(({ stage }) => stage.name)).toEqual(names);
    });

    it('should accept the order when the ids are sent in uppercase', async () => {
      const ids = [stages.Call, stages.New, stages['Proposal sent'], stages.Contract];

      const response = await owner.http
        .put('/api/stages/order')
        .send({ ids: ids.map((id) => id.toUpperCase()) });

      expect(response.status).toBe(200);
    });

    it.each([
      ['misses an open stage', (ids: StageIds) => [ids.New, ids.Call, ids.Contract]],
      [
        'holds the won stage',
        (ids: StageIds) => [ids.New, ids.Call, ids['Proposal sent'], ids.Contract, ids.Paid],
      ],
    ])('should answer 409 STAGES_CHANGED when the list %s', async (_case, build) => {
      const response = await owner.http.put('/api/stages/order').send({ ids: build(stages) });

      expect(response.status).toBe(409);
      expect(problemCode(response)).toBe('STAGES_CHANGED');
    });
  });

  describe('delete', () => {
    it('should let an entry for a deal be written when a stage delete holds the deals of its stage', async () => {
      const deal = await createDeal(owner.http, dealBody({ stageId: stages.Call }));
      const workspaceId = owner.session.workspace.id;

      const held = testApp.app
        .get(StagesRepository)
        .inWorkspaceLock(workspaceId, async (locked) => {
          await locked.listDealIds(workspaceId, stages.Call);
          await prisma.$transaction(async (other) => {
            await other.$executeRaw`SET LOCAL lock_timeout = '200ms'`;
            await other.activity.create({
              data: {
                workspaceId,
                dealId: deal.id,
                actorId: owner.session.user.id,
                type: 'deal_restored',
                payload: {},
              },
            });
          });
        });

      await expect(held).resolves.toBeUndefined();
    });

    it('should hold a deal write into the stage back when a stage delete has locked it', async () => {
      const workspaceId = owner.session.workspace.id;
      const userId = owner.session.user.id;

      const held = testApp.app
        .get(StagesRepository)
        .inWorkspaceLock(workspaceId, async (locked) => {
          await locked.lockStage(workspaceId, stages.Call);
          await prisma.$transaction(async (other) => {
            await other.$executeRaw`SET LOCAL lock_timeout = '200ms'`;
            await other.deal.create({
              data: {
                workspaceId,
                clientId: client.id,
                stageId: stages.Call,
                assigneeId: userId,
                createdById: userId,
                title: 'Deal',
                amount: 100_00,
                currency: 'USD',
                position: positionBetween(null, null),
              },
            });
          });
        });

      await expect(held).rejects.toThrow(/lock timeout/);
      expect(await prisma.deal.count({ where: { stageId: stages.Call } })).toBe(0);
    });

    it('should move every deal to the end of the target with an entry and version + 1 each when a stage with deals is deleted', async () => {
      const target = await createDeal(
        owner.http,
        dealBody({ title: 'Already there', stageId: stages.Call }),
      );
      const second = await createDeal(owner.http, dealBody({ title: 'Second' }));
      const first = await createDeal(owner.http, dealBody({ title: 'First' }));
      const deleted = await createDeal(owner.http, dealBody({ title: 'Deleted' }));
      await owner.http.delete(`/api/deals/${deleted.id}`).expect(204);
      const gone = await createClient(owner.http, { name: 'Gone' });
      const hidden = await createDeal(owner.http, dealBody({ title: 'Hidden', clientId: gone.id }));
      await owner.http.delete(`/api/clients/${gone.id}`).expect(204);

      const response = await owner.http.delete(
        `/api/stages/${stages.New}?moveDealsTo=${stages.Call}`,
      );

      expect(response.status).toBe(204);
      const moved = await prisma.deal.findMany({
        where: { stageId: stages.Call },
        orderBy: [{ position: 'asc' }, { id: 'asc' }],
        select: { id: true, version: true },
      });
      expect(moved.map(({ id }) => id)).toEqual([
        target.id,
        hidden.id,
        deleted.id,
        first.id,
        second.id,
      ]);
      expect(moved.map(({ version }) => version)).toEqual([1, 2, 3, 2, 2]);
      const entries = await prisma.activity.findMany({
        where: { type: 'deal_moved' },
        select: { dealId: true, payload: true },
      });
      expect(entries).toHaveLength(4);
      expect(entries[0]?.payload).toMatchObject({
        from: { id: stages.New, name: 'New' },
        to: { id: stages.Call, name: 'Call' },
        reason: 'stage_deleted',
      });
      expect((await stored()).map(({ name, position }) => [name, position])).toEqual([
        ['Call', 0],
        ['Proposal sent', 1],
        ['Contract', 2],
        ['Paid', 3],
        ['Lost', 4],
      ]);
    });

    it.each([
      ['the won stage', (ids: StageIds) => ids.Paid],
      ['the stage itself', (ids: StageIds) => ids.New],
      ['missing', () => ''],
      ['another workspace stage', (_ids: StageIds, foreign: StageIds) => foreign.Call],
    ])('should answer 400 on moveDealsTo when the target is %s', async (_case, pick) => {
      const stranger = await registerAccount(testApp, 'Other Studio');
      const foreign = await findStageIds(testApp, stranger.session.workspace.id);
      const target = pick(stages, foreign);
      const query = target === '' ? '' : `?moveDealsTo=${target}`;

      const response = await owner.http.delete(`/api/stages/${stages.New}${query}`);

      expect(response.status).toBe(400);
      expect(errorPaths(response)).toEqual(['moveDealsTo']);
    });

    it.each([
      ['the won stage', 'Paid', 'STAGE_NOT_DELETABLE'],
      ['the lost stage', 'Lost', 'STAGE_NOT_DELETABLE'],
    ] as const)('should answer 409 %s when it is deleted', async (_case, name, code) => {
      const response = await owner.http.delete(
        `/api/stages/${stages[name]}?moveDealsTo=${stages.New}`,
      );

      expect(response.status).toBe(409);
      expect(problemCode(response)).toBe(code);
    });

    it('should answer 409 LAST_OPEN_STAGE when the only open stage is deleted', async () => {
      for (const name of ['Call', 'Proposal sent', 'Contract'] as const) {
        await owner.http
          .delete(`/api/stages/${stages[name]}?moveDealsTo=${stages.New}`)
          .expect(204);
      }

      const response = await owner.http.delete(
        `/api/stages/${stages.New}?moveDealsTo=${stages.New}`,
      );

      expect(response.status).toBe(409);
      expect(problemCode(response)).toBe('LAST_OPEN_STAGE');
    });

    it('should answer 404 STAGE_NOT_FOUND when the stage is in another workspace', async () => {
      const stranger = await registerAccount(testApp, 'Other Studio');

      const response = await stranger.http.delete(
        `/api/stages/${stages.Call}?moveDealsTo=${stages.New}`,
      );

      expect(response.status).toBe(404);
      expect(problemCode(response)).toBe('STAGE_NOT_FOUND');
      expect(await stored()).toHaveLength(6);
    });

    it('should neither overwrite nor deadlock when a move and an edit of its deals run at once', async () => {
      for (let round = 0; round < 5; round += 1) {
        const stage = stageSchema.parse((await addStage(`Temp ${String(round)}`)).body);
        const moving = await createDeal(owner.http, dealBody({ stageId: stage.id }));
        const edited = await createDeal(owner.http, dealBody({ stageId: stage.id }));

        const [deletion, move, edit] = await Promise.all([
          owner.http.delete(`/api/stages/${stage.id}?moveDealsTo=${stages.Call}`),
          manager.http
            .post(`/api/deals/${moving.id}/move`)
            .send({ version: 1, stageId: stages.Contract, afterId: null }),
          manager.http.patch(`/api/deals/${edited.id}`).send({ version: 1, title: 'Edited' }),
        ]);

        expect(deletion.status).toBe(204);
        expect([200, 409]).toContain(edit.status);
        const row = await prisma.deal.findUniqueOrThrow({ where: { id: moving.id } });
        const reasons = await prisma.activity.count({
          where: { dealId: moving.id, payload: { path: ['reason'], equals: 'stage_deleted' } },
        });
        if (move.status === 200) {
          expect([row.stageId, reasons]).toEqual([stages.Contract, 0]);
        } else {
          expect(problemCode(move)).toBe('DEAL_CHANGED');
          expect([row.stageId, reasons]).toEqual([stages.Call, 1]);
        }
      }
    });
  });
});
