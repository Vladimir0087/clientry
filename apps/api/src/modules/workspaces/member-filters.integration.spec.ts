import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { clientListResponseSchema } from '@clientry/shared/clients';
import { boardResponseSchema } from '@clientry/shared/deals';
import { taskListResponseSchema } from '@clientry/shared/tasks';

import { createTestApp } from '../../../test/create-test-app.js';
import type { TestApp } from '../../../test/create-test-app.js';
import { addManager, registerAccount } from '../../../test/fixtures/accounts.js';
import type { TestAccount } from '../../../test/fixtures/accounts.js';
import { insertClients } from '../../../test/fixtures/clients.js';
import { findStageIds, insertDeals } from '../../../test/fixtures/deals.js';
import { insertTasks } from '../../../test/fixtures/tasks.js';
import { resetDatabase } from '../../../test/reset-database.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { positionsAfter } from '../deals/deal-position.js';

const DUE_AT = new Date('2030-03-15T12:00:00.000Z');

describe('member filters', () => {
  let testApp: TestApp;
  let owner: TestAccount;
  let manager: TestAccount;
  let stranger: TestAccount;

  async function clientNames(query: string): Promise<string[]> {
    const response = await owner.http.get(`/api/clients${query}`).expect(200);
    return clientListResponseSchema.parse(response.body).items.map(({ name }) => name);
  }

  async function boardTitles(query: string): Promise<string[]> {
    const response = await owner.http.get(`/api/deals/board${query}`).expect(200);
    return boardResponseSchema
      .parse(response.body)
      .columns.flatMap(({ deals }) => deals.map(({ title }) => title))
      .toSorted();
  }

  async function taskTitles(query: string): Promise<string[]> {
    const response = await owner.http.get(`/api/tasks${query}`).expect(200);
    return taskListResponseSchema
      .parse(response.body)
      .items.map(({ title }) => title)
      .toSorted();
  }

  beforeAll(async () => {
    testApp = await createTestApp();
  });

  beforeEach(async () => {
    await resetDatabase(testApp.app.get(PrismaService));
    owner = await registerAccount(testApp, 'Pixel Studio');
    stranger = await registerAccount(testApp, 'Other Studio');
    manager = await addManager(testApp, owner.session.workspace.id);
    const workspaceId = owner.session.workspace.id;
    const ownerId = owner.session.user.id;
    const managerId = manager.session.user.id;
    const [clientId = ''] = await insertClients(testApp, workspaceId, [
      { name: 'Ann client', createdById: ownerId },
      { name: 'Max client', createdById: managerId },
    ]);
    const stages = await findStageIds(testApp, workspaceId);
    const [first = '', second = '', third = ''] = positionsAfter(null, 3);
    await insertDeals(testApp, workspaceId, [
      { title: 'Ann deal', clientId, stageId: stages.New, createdById: ownerId, position: first },
      {
        title: 'Max deal',
        clientId,
        stageId: stages.New,
        createdById: managerId,
        position: second,
      },
      {
        title: 'Max won deal',
        clientId,
        stageId: stages.Paid,
        createdById: managerId,
        position: third,
        closedAt: new Date(),
      },
    ]);
    await insertTasks(testApp, workspaceId, [
      { title: 'Ann task', createdById: ownerId, dueAt: DUE_AT },
      { title: 'Max task', createdById: managerId, dueAt: DUE_AT },
      { title: 'Max done task', createdById: managerId, dueAt: DUE_AT, doneAt: new Date() },
    ]);
  });

  afterAll(async () => {
    await testApp.app.close();
  });

  it('should keep only that member’s records when each list filters by a member id', async () => {
    const id = manager.session.user.id;

    expect(await clientNames(`?createdBy=${id}`)).toEqual(['Max client']);
    expect(await boardTitles(`?assignee=${id}`)).toEqual(['Max deal', 'Max won deal']);
    expect(await taskTitles(`?assignee=${id}`)).toEqual(['Max task']);
  });

  it('should still find a removed member’s closed deals and done tasks when filtered by their id', async () => {
    const id = manager.session.user.id;
    await owner.http
      .delete(`/api/members/${id}`)
      .query({ transferTo: owner.session.user.id })
      .expect(204);

    expect(await clientNames(`?createdBy=${id}`)).toEqual(['Max client']);
    expect(await boardTitles(`?assignee=${id}`)).toEqual(['Max won deal']);
    expect(await taskTitles(`?assignee=${id}&status=done`)).toEqual(['Max done task']);
  });

  it('should return nothing when the id is another workspace’s user with records of their own', async () => {
    const id = stranger.session.user.id;
    const workspaceId = stranger.session.workspace.id;
    const [clientId = ''] = await insertClients(testApp, workspaceId, [
      { name: 'Stranger client', createdById: id },
    ]);
    const stages = await findStageIds(testApp, workspaceId);
    const [position = ''] = positionsAfter(null, 1);
    await insertDeals(testApp, workspaceId, [
      { title: 'Stranger deal', clientId, stageId: stages.New, createdById: id, position },
    ]);
    await insertTasks(testApp, workspaceId, [
      { title: 'Stranger task', createdById: id, dueAt: DUE_AT },
    ]);

    expect(await clientNames(`?createdBy=${id}`)).toEqual([]);
    expect(await boardTitles(`?assignee=${id}`)).toEqual([]);
    expect(await taskTitles(`?assignee=${id}`)).toEqual([]);
  });

  it('should keep the caller’s records when the filter is me', async () => {
    expect(await clientNames('?createdBy=me')).toEqual(['Ann client']);
    expect(await boardTitles('?assignee=me')).toEqual(['Ann deal']);
    expect(await taskTitles('?assignee=me')).toEqual(['Ann task']);
  });

  it.each([
    '/api/clients?createdBy=abc',
    '/api/deals/board?assignee=abc',
    '/api/tasks?assignee=abc',
  ])('should answer 400 when %s is requested', async (path) => {
    const response = await owner.http.get(path);

    expect(response.status).toBe(400);
  });
});
