import { describe, expect, it, vi } from 'vitest';

import type { ActivityEvent } from '@clientry/shared/activity';

import { ActivityLog } from './activity-log.repository.js';
import type { ActivityRecord } from './activity-log.repository.js';

type Transaction = Parameters<ActivityLog['record']>[0];

const WORKSPACE_ID = '0199a3c4-5e70-7b1c-8d2e-3f4a5b6c7d8e';
const ACTOR_ID = '0199a3c4-5e6f-7a8b-9c0d-1e2f3a4b5c6d';
const SUBJECT_ID = '0199b1e2-3c4d-7e5f-8a9b-0c1d2e3f4a5b';

function createTransaction(): { tx: Transaction; createMany: ReturnType<typeof vi.fn> } {
  const createMany = vi.fn().mockResolvedValue({ count: 1 });
  return { tx: { activity: { createMany } } as unknown as Transaction, createMany };
}

function entry(event: ActivityEvent, subjectId = SUBJECT_ID): ActivityRecord {
  return { workspaceId: WORKSPACE_ID, actorId: ACTOR_ID, subjectId, event };
}

describe('ActivityLog', () => {
  it.each([
    ['deal_deleted', { type: 'deal_deleted', payload: {} }, 'dealId'],
    ['client_created', { type: 'client_created', payload: {} }, 'clientId'],
    ['task_completed', { type: 'task_completed', payload: {} }, 'taskId'],
  ] as const)(
    'should set only %s subject column %s when the entry is written',
    async (_type, event, column) => {
      const { tx, createMany } = createTransaction();

      await new ActivityLog().record(tx, [entry(event)]);

      expect(createMany).toHaveBeenCalledWith({
        data: [
          {
            workspaceId: WORKSPACE_ID,
            actorId: ACTOR_ID,
            type: event.type,
            payload: {},
            dealId: null,
            clientId: null,
            taskId: null,
            [column]: SUBJECT_ID,
          },
        ],
      });
    },
  );

  it('should throw before any write when a payload does not parse', async () => {
    const { tx, createMany } = createTransaction();
    const broken = { type: 'task_created', payload: { assignee: { id: ACTOR_ID, name: 'Ann' } } };

    const result = new ActivityLog().record(tx, [
      entry({ type: 'client_created', payload: {} }),
      entry(broken as unknown as ActivityEvent),
    ]);

    await expect(result).rejects.toThrow();
    expect(createMany).not.toHaveBeenCalled();
  });

  it('should write a batch with one createMany when several entries are given', async () => {
    const { tx, createMany } = createTransaction();
    const event: ActivityEvent = { type: 'deal_restored', payload: {} };

    await new ActivityLog().record(tx, [entry(event), entry(event, ACTOR_ID)]);

    expect(createMany).toHaveBeenCalledTimes(1);
    expect(createMany.mock.calls[0]?.[0]).toMatchObject({
      data: [{ dealId: SUBJECT_ID }, { dealId: ACTOR_ID }],
    });
  });

  it('should write nothing when the batch is empty', async () => {
    const { tx, createMany } = createTransaction();

    await new ActivityLog().record(tx, []);

    expect(createMany).not.toHaveBeenCalled();
  });
});
