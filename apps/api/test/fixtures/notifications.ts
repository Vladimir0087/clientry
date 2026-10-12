import { PrismaService } from '../../src/infra/prisma/prisma.service.js';
import type { TestApp } from '../create-test-app.js';

export interface NotificationSeed {
  readonly workspaceId: string;
  readonly userId: string;
  readonly createdAt: Date;
  readonly title?: string;
  readonly readAt?: Date;
}

const TASK_ID = '0199c2a1-4b5c-7d6e-8f9a-0b1c2d3e4f5a';

// Inserted directly with no task row: task_id is nullable and the payload is a snapshot.
export async function insertNotifications(
  testApp: TestApp,
  seeds: readonly NotificationSeed[],
): Promise<string[]> {
  const prisma = testApp.app.get(PrismaService);
  const ids: string[] = [];
  for (const { title, ...seed } of seeds) {
    const { id } = await prisma.notification.create({
      data: {
        ...seed,
        type: 'task_reminder',
        payload: {
          task: { id: TASK_ID, title: title ?? 'Call Romashka' },
          dueAt: '2030-03-15T12:00:00.000Z',
        },
      },
      select: { id: true },
    });
    ids.push(id);
  }
  return ids;
}

export function countNotifications(testApp: TestApp, userId: string): Promise<number> {
  return testApp.app.get(PrismaService).notification.count({ where: { userId } });
}
