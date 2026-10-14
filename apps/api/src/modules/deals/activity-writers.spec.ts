import { describe, expect, it, vi } from 'vitest';

import type { DealEvent } from '@clientry/shared/deals';

import { DealHandover } from './deal-handover.repository.js';
import { PrismaDealsTransaction } from './prisma-deals-transaction.repository.js';
import { PrismaLockedStagesRepository } from './prisma-locked-stages.repository.js';
import type { DealMovedEvent } from './stages.repository.js';
import { CALL_STAGE, NEW_STAGE, OWNER, WORKSPACE_ID } from '../../../test/support/deal-doubles.js';
import type { ActivityLog } from '../activity/activity-log.repository.js';

type Transaction = Parameters<ActivityLog['record']>[0];

const DEAL_IDS = ['0199b1e2-3c4d-7e5f-8a9b-0c1d2e3f4a5b', '0199b1e2-3c4d-7e5f-8a9b-0c1d2e3f4a5c'];
const ANN = { id: OWNER.id, name: 'Ann' };
const MAX = { id: '0199a3c4-6a7b-7c8d-9e0f-1a2b3c4d5e6f', name: 'Max' };

function createActivityLog(): { log: ActivityLog; record: ReturnType<typeof vi.fn> } {
  const record = vi.fn().mockResolvedValue(undefined);
  return { log: { record }, record };
}

function createTransaction(): Transaction {
  return {
    $executeRaw: vi.fn().mockResolvedValue(DEAL_IDS.length),
    $queryRaw: vi.fn().mockResolvedValue(DEAL_IDS.map((id) => ({ id }))),
  } as unknown as Transaction;
}

describe('PrismaDealsTransaction', () => {
  it('should write the entry through ActivityLog in its transaction when addActivity runs', async () => {
    const { log, record } = createActivityLog();
    const tx = createTransaction();
    const event: DealEvent = { type: 'deal_deleted', payload: {} };

    await new PrismaDealsTransaction(tx, log).addActivity(
      WORKSPACE_ID,
      DEAL_IDS[0] ?? '',
      OWNER.id,
      event,
    );

    expect(record).toHaveBeenCalledWith(tx, [
      { workspaceId: WORKSPACE_ID, actorId: OWNER.id, subjectId: DEAL_IDS[0], event },
    ]);
  });
});

describe('PrismaLockedStagesRepository', () => {
  it('should write one entry per transferred deal through ActivityLog when a stage is deleted', async () => {
    const { log, record } = createActivityLog();
    const tx = createTransaction();
    const event: DealMovedEvent = {
      type: 'deal_moved',
      payload: { from: CALL_STAGE, to: NEW_STAGE, reason: 'stage_deleted' },
    };
    const transfers = DEAL_IDS.map((id, index) => ({ id, position: `a${String(index)}` }));

    await new PrismaLockedStagesRepository(tx, log).transferDeals(
      WORKSPACE_ID,
      OWNER.id,
      NEW_STAGE.id,
      transfers,
      event,
    );

    expect(record).toHaveBeenCalledWith(
      tx,
      DEAL_IDS.map((subjectId) => ({
        workspaceId: WORKSPACE_ID,
        actorId: OWNER.id,
        subjectId,
        event,
      })),
    );
  });
});

describe('DealHandover', () => {
  it('should write an assignee change per handed over deal through ActivityLog when deals move', async () => {
    const { log, record } = createActivityLog();
    const tx = createTransaction();
    const event = {
      type: 'deal_updated',
      payload: { changes: [{ field: 'assignee', from: MAX, to: ANN }] },
    };

    const count = await new DealHandover(log).handOpenDealsOver(tx, {
      workspaceId: WORKSPACE_ID,
      actorId: OWNER.id,
      from: MAX,
      to: ANN,
    });

    expect(count).toBe(DEAL_IDS.length);
    expect(record).toHaveBeenCalledWith(
      tx,
      DEAL_IDS.map((subjectId) => ({
        workspaceId: WORKSPACE_ID,
        actorId: OWNER.id,
        subjectId,
        event,
      })),
    );
  });
});
