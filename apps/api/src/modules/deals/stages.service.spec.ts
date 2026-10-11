import { Logger } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MockInstance } from 'vitest';

import type { Stage } from '@clientry/shared/deals';

import {
  LastOpenStageError,
  StageLimitReachedError,
  StageNameTakenError,
  StageNotDeletableError,
  StageNotFoundError,
  StagesChangedError,
} from './errors.js';
import type { LockedStagesRepository, StagesRepository } from './stages.repository.js';
import { StagesService } from './stages.service.js';
import {
  CALL_STAGE,
  LOST_STAGE,
  NEW_STAGE,
  OWNER,
  PROPOSAL_STAGE,
  WON_STAGE,
  WORKSPACE_ID,
} from '../../../test/support/deal-doubles.js';
import { RequestValidationError } from '../../common/errors/request-validation.error.js';

const STAGES: readonly Stage[] = [NEW_STAGE, CALL_STAGE, PROPOSAL_STAGE, WON_STAGE, LOST_STAGE];
const ADDED: Stage = { id: '0199a3c4-6f70-7a81-9b2c-3d4e5f6a7b99', name: 'Demo', kind: 'open' };
const DEAL_IDS = ['0199b1e2-3c4d-7e5f-8a9b-0c1d2e3f4a01', '0199b1e2-3c4d-7e5f-8a9b-0c1d2e3f4a02'];

function openStage(index: number): Stage {
  return {
    id: `0199a3c4-6f70-7a81-9b2c-${index.toString(16).padStart(12, '0')}`,
    name: `S${String(index)}`,
    kind: 'open',
  };
}

function createLockedMock(stages: readonly Stage[] = STAGES) {
  return {
    list: vi.fn<LockedStagesRepository['list']>().mockResolvedValue([...stages]),
    listWithCounts: vi.fn<LockedStagesRepository['listWithCounts']>().mockResolvedValue([]),
    create: vi.fn<LockedStagesRepository['create']>().mockResolvedValue(ADDED),
    rename: vi
      .fn<LockedStagesRepository['rename']>()
      .mockImplementation((_workspaceId, id, name) =>
        Promise.resolve({ ...(stages.find((stage) => stage.id === id) ?? NEW_STAGE), name }),
      ),
    saveOrder: vi.fn<LockedStagesRepository['saveOrder']>().mockResolvedValue(undefined),
    lockStage: vi.fn<LockedStagesRepository['lockStage']>().mockResolvedValue(undefined),
    listDealIds: vi.fn<LockedStagesRepository['listDealIds']>().mockResolvedValue(DEAL_IDS),
    findLastPosition: vi.fn<LockedStagesRepository['findLastPosition']>().mockResolvedValue(null),
    transferDeals: vi.fn<LockedStagesRepository['transferDeals']>().mockResolvedValue(undefined),
    delete: vi.fn<LockedStagesRepository['delete']>().mockResolvedValue(undefined),
  } satisfies LockedStagesRepository;
}

describe('StagesService', () => {
  let locked: ReturnType<typeof createLockedMock>;
  let service: StagesService;
  let logSpy: MockInstance<Logger['log']>;

  function useStages(stages: readonly Stage[]): void {
    locked = createLockedMock(stages);
  }

  beforeEach(() => {
    locked = createLockedMock();
    const repository: StagesRepository = {
      listWithCounts: vi.fn<StagesRepository['listWithCounts']>().mockResolvedValue([]),
      inWorkspaceLock: (_workspaceId, work) => work(locked),
    };
    service = new StagesService(repository);
    logSpy = vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('create', () => {
    it('should add the stage before won and lost and rewrite the positions when there is room', async () => {
      await service.create(OWNER, { name: 'Demo' });

      expect(locked.create).toHaveBeenCalledWith(WORKSPACE_ID, 'Demo', 3);
      expect(locked.saveOrder).toHaveBeenCalledWith(WORKSPACE_ID, [
        NEW_STAGE.id,
        CALL_STAGE.id,
        PROPOSAL_STAGE.id,
        ADDED.id,
        WON_STAGE.id,
        LOST_STAGE.id,
      ]);
    });

    it('should throw StageLimitReachedError when ten open stages exist', async () => {
      useStages([
        ...Array.from({ length: 10 }, (_, index) => openStage(index)),
        WON_STAGE,
        LOST_STAGE,
      ]);

      await expect(service.create(OWNER, { name: 'Eleventh' })).rejects.toBeInstanceOf(
        StageLimitReachedError,
      );
      expect(locked.create).not.toHaveBeenCalled();
    });

    it('should throw StageNameTakenError when the name is taken in another case', async () => {
      await expect(service.create(OWNER, { name: 'pAID' })).rejects.toBeInstanceOf(
        StageNameTakenError,
      );
    });
  });

  describe('rename', () => {
    it('should rename the stage when the new name is its own in another case', async () => {
      await expect(service.rename(OWNER, CALL_STAGE.id, { name: 'CALL' })).resolves.toMatchObject({
        name: 'CALL',
      });
    });

    it('should throw StageNameTakenError when another stage has the name', async () => {
      await expect(service.rename(OWNER, CALL_STAGE.id, { name: 'new' })).rejects.toBeInstanceOf(
        StageNameTakenError,
      );
      expect(locked.rename).not.toHaveBeenCalled();
    });

    it('should throw StageNotFoundError when the stage is not in the workspace', async () => {
      await expect(service.rename(OWNER, ADDED.id, { name: 'X' })).rejects.toBeInstanceOf(
        StageNotFoundError,
      );
    });
  });

  describe('reorder', () => {
    it('should save the new open order with won and lost last when the ids match the open stages', async () => {
      await service.reorder(OWNER, { ids: [PROPOSAL_STAGE.id, NEW_STAGE.id, CALL_STAGE.id] });

      expect(locked.saveOrder).toHaveBeenCalledWith(WORKSPACE_ID, [
        PROPOSAL_STAGE.id,
        NEW_STAGE.id,
        CALL_STAGE.id,
        WON_STAGE.id,
        LOST_STAGE.id,
      ]);
    });

    it.each([
      ['misses an open stage', [NEW_STAGE.id, CALL_STAGE.id]],
      ['holds the won stage', [NEW_STAGE.id, CALL_STAGE.id, WON_STAGE.id]],
      ['holds an unknown stage', [NEW_STAGE.id, CALL_STAGE.id, ADDED.id]],
    ])('should throw StagesChangedError when the list %s', async (_case, ids) => {
      await expect(service.reorder(OWNER, { ids })).rejects.toBeInstanceOf(StagesChangedError);
      expect(locked.saveOrder).not.toHaveBeenCalled();
    });
  });

  describe('delete', () => {
    it.each([WON_STAGE, LOST_STAGE])(
      'should throw StageNotDeletableError when $name is deleted',
      async (stage) => {
        await expect(
          service.delete(OWNER, stage.id, { moveDealsTo: NEW_STAGE.id }),
        ).rejects.toBeInstanceOf(StageNotDeletableError);
      },
    );

    it('should throw LastOpenStageError when the only open stage is deleted', async () => {
      useStages([NEW_STAGE, WON_STAGE, LOST_STAGE]);

      await expect(
        service.delete(OWNER, NEW_STAGE.id, { moveDealsTo: CALL_STAGE.id }),
      ).rejects.toBeInstanceOf(LastOpenStageError);
    });

    it.each([
      ['closed', WON_STAGE.id],
      ['the stage itself', NEW_STAGE.id],
      ['unknown', ADDED.id],
    ])(
      'should throw RequestValidationError on moveDealsTo when the target is %s',
      async (_case, target) => {
        const result = service.delete(OWNER, NEW_STAGE.id, { moveDealsTo: target });

        await expect(result).rejects.toBeInstanceOf(RequestValidationError);
        await expect(result).rejects.toMatchObject({
          fieldErrors: [{ path: 'moveDealsTo', message: 'Choose another open stage' }],
        });
        expect(locked.transferDeals).not.toHaveBeenCalled();
      },
    );

    it('should move the deals to the end of the target in order and then delete the stage when it has deals', async () => {
      await service.delete(OWNER, NEW_STAGE.id, { moveDealsTo: CALL_STAGE.id });

      expect(locked.lockStage).toHaveBeenCalledWith(WORKSPACE_ID, NEW_STAGE.id);
      const [, actorId, targetId, transfers, event] = locked.transferDeals.mock.calls[0] ?? [];
      expect([actorId, targetId]).toEqual([OWNER.id, CALL_STAGE.id]);
      expect(transfers?.map(({ id }) => id)).toEqual(DEAL_IDS);
      const [first = '', second = ''] = transfers?.map(({ position }) => position) ?? [];
      expect(first < second).toBe(true);
      expect(event).toEqual({
        type: 'deal_moved',
        payload: { from: NEW_STAGE, to: CALL_STAGE, reason: 'stage_deleted' },
      });
      expect(locked.delete).toHaveBeenCalledWith(WORKSPACE_ID, NEW_STAGE.id);
      expect(locked.saveOrder).toHaveBeenCalledWith(WORKSPACE_ID, [
        CALL_STAGE.id,
        PROPOSAL_STAGE.id,
        WON_STAGE.id,
        LOST_STAGE.id,
      ]);
    });

    it('should lock the stage before it reads the deals when a stage is deleted', async () => {
      await service.delete(OWNER, NEW_STAGE.id, { moveDealsTo: CALL_STAGE.id });

      const [lockedAt = 0] = locked.lockStage.mock.invocationCallOrder;
      const [readAt = 0] = locked.listDealIds.mock.invocationCallOrder;
      expect(lockedAt).toBeGreaterThan(0);
      expect(lockedAt).toBeLessThan(readAt);
    });
  });

  describe('logs', () => {
    const CALLER = { workspaceId: WORKSPACE_ID, userId: OWNER.id };

    it.each([
      [
        'a stage is added',
        (stages: StagesService) => stages.create(OWNER, { name: 'Demo' }),
        { ...CALLER, stageId: ADDED.id },
        'Stage created',
      ],
      [
        'a stage is renamed',
        (stages: StagesService) => stages.rename(OWNER, CALL_STAGE.id, { name: 'Calls' }),
        { ...CALLER, stageId: CALL_STAGE.id },
        'Stage renamed',
      ],
      [
        'the stages are reordered',
        (stages: StagesService) =>
          stages.reorder(OWNER, { ids: [PROPOSAL_STAGE.id, NEW_STAGE.id, CALL_STAGE.id] }),
        CALLER,
        'Stages reordered',
      ],
      [
        'a stage is deleted',
        (stages: StagesService) =>
          stages.delete(OWNER, NEW_STAGE.id, { moveDealsTo: CALL_STAGE.id }),
        { ...CALLER, stageId: NEW_STAGE.id, targetStageId: CALL_STAGE.id, movedDeals: 2 },
        'Stage deleted',
      ],
    ])('should log ids when %s', async (_case, act, context, message) => {
      await act(service);

      expect(logSpy).toHaveBeenCalledWith(context, message);
    });
  });
});
