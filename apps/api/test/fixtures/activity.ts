import type { Response } from 'supertest';
import { expect } from 'vitest';

import { activityFeedResponseSchema } from '@clientry/shared/activity';
import type { ActivityEvent, ActivityFeedResponse } from '@clientry/shared/activity';

import { PrismaService } from '../../src/infra/prisma/prisma.service.js';
import type { TestApp } from '../create-test-app.js';

export type ActivitySubjectColumn =
  { readonly dealId: string } | { readonly clientId: string } | { readonly taskId: string };

export interface ActivitySeed {
  readonly actorId: string;
  readonly subject: ActivitySubjectColumn;
  readonly event: ActivityEvent;
  readonly createdAt: Date;
}

// Inserted directly, so tests set times and skip the writes that would record them.
export async function insertActivityEntries(
  testApp: TestApp,
  workspaceId: string,
  seeds: readonly ActivitySeed[],
): Promise<void> {
  await testApp.app.get(PrismaService).activity.createMany({
    data: seeds.map(({ actorId, subject, event, createdAt }) => ({
      workspaceId,
      actorId,
      ...subject,
      type: event.type,
      payload: event.payload,
      createdAt,
    })),
  });
}

export function parseFeed(response: Response): ActivityFeedResponse {
  expect(response.status).toBe(200);
  return activityFeedResponseSchema.parse(response.body);
}
