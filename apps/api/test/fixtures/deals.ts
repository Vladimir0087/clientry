import type { Agent } from 'supertest';

import { dealSchema } from '@clientry/shared/deals';
import type {
  CreateDealRequest,
  Currency,
  Deal,
  DealEvent,
  MoveDealRequest,
} from '@clientry/shared/deals';

import { PrismaService } from '../../src/infra/prisma/prisma.service.js';
import type { TestApp } from '../create-test-app.js';
import { TRUSTED_ORIGIN } from '../support/test-env.js';

export type DefaultStageName = 'New' | 'Call' | 'Proposal sent' | 'Contract' | 'Paid' | 'Lost';

export type StageIds = Readonly<Record<DefaultStageName, string>>;

export interface DealSeed {
  readonly clientId: string;
  readonly stageId: string;
  readonly createdById: string;
  readonly position: string;
  readonly assigneeId?: string;
  readonly title?: string;
  readonly amount?: number;
  readonly currency?: Currency;
  readonly closedAt?: Date;
  readonly createdAt?: Date;
  readonly deletedAt?: Date;
}

export async function findStageIds(testApp: TestApp, workspaceId: string): Promise<StageIds> {
  const stages = await testApp.app.get(PrismaService).stage.findMany({
    where: { workspaceId },
    select: { id: true, name: true },
  });
  const byName = new Map(stages.map(({ id, name }) => [name, id]));
  const id = (name: DefaultStageName): string => {
    const stageId = byName.get(name);
    if (stageId === undefined) {
      throw new Error(`Default stage ${name} is missing`);
    }
    return stageId;
  };
  return {
    New: id('New'),
    Call: id('Call'),
    'Proposal sent': id('Proposal sent'),
    Contract: id('Contract'),
    Paid: id('Paid'),
    Lost: id('Lost'),
  };
}

export async function createDeal(http: Agent, body: CreateDealRequest): Promise<Deal> {
  const response = await http
    .post('/api/deals')
    .set('Origin', TRUSTED_ORIGIN)
    .send(body)
    .expect(201);
  return dealSchema.parse(response.body);
}

export async function moveDeal(http: Agent, id: string, body: MoveDealRequest): Promise<Deal> {
  const response = await http
    .post(`/api/deals/${id}/move`)
    .set('Origin', TRUSTED_ORIGIN)
    .send(body)
    .expect(200);
  return dealSchema.parse(response.body);
}

// Inserted directly, so tests set positions, dates and deletions and skip a request per row.
export async function insertDeals(
  testApp: TestApp,
  workspaceId: string,
  seeds: readonly DealSeed[],
): Promise<string[]> {
  const prisma = testApp.app.get(PrismaService);
  const ids: string[] = [];
  for (const { assigneeId, ...seed } of seeds) {
    const { id } = await prisma.deal.create({
      data: {
        title: 'Seeded deal',
        amount: 100_00,
        currency: 'USD',
        ...seed,
        assigneeId: assigneeId ?? seed.createdById,
        workspaceId,
      },
      select: { id: true },
    });
    ids.push(id);
  }
  return ids;
}

export async function insertActivities(
  testApp: TestApp,
  workspaceId: string,
  dealId: string,
  actorId: string,
  events: readonly (DealEvent & { readonly createdAt: Date })[],
): Promise<void> {
  await testApp.app.get(PrismaService).activity.createMany({
    data: events.map(({ type, payload, createdAt }) => ({
      workspaceId,
      dealId,
      actorId,
      type,
      payload,
      createdAt,
    })),
  });
}
