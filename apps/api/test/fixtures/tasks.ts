import type { Agent } from 'supertest';

import { taskSchema } from '@clientry/shared/tasks';
import type { CreateTaskRequest, Task } from '@clientry/shared/tasks';

import { PrismaService } from '../../src/infra/prisma/prisma.service.js';
import type { TestApp } from '../create-test-app.js';
import { TRUSTED_ORIGIN } from '../support/test-env.js';

export interface TaskSeed {
  readonly createdById: string;
  readonly dueAt: Date;
  readonly assigneeId?: string;
  readonly title?: string;
  readonly clientId?: string;
  readonly dealId?: string;
  readonly remindAt?: Date;
  readonly reminderSentAt?: Date;
  readonly doneAt?: Date;
  readonly deletedAt?: Date;
}

export async function createTask(http: Agent, body: CreateTaskRequest): Promise<Task> {
  const response = await http
    .post('/api/tasks')
    .set('Origin', TRUSTED_ORIGIN)
    .send(body)
    .expect(201);
  return taskSchema.parse(response.body);
}

// Inserted directly, so tests set times, completion and deletion and skip a request per row.
export async function insertTasks(
  testApp: TestApp,
  workspaceId: string,
  seeds: readonly TaskSeed[],
): Promise<string[]> {
  const prisma = testApp.app.get(PrismaService);
  const ids: string[] = [];
  for (const { assigneeId, ...seed } of seeds) {
    const { id } = await prisma.task.create({
      data: {
        title: 'Seeded task',
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
