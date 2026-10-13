import { Logger } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MockInstance } from 'vitest';

import { DealMovesService } from './deal-moves.service.js';
import { positionsAfter } from './deal-position.js';
import { BoardChangedError, DealChangedError, DealNotFoundError } from './errors.js';
import {
  CALL_STAGE,
  createRepositoryMock,
  createTransactionMock,
  DEAL,
  LOST_STAGE,
  MANAGER,
  NEW_STAGE,
  OWNER,
  WON_STAGE,
  WORKSPACE_ID,
} from '../../../test/support/deal-doubles.js';
import type { RepositoryMock, TransactionMock } from '../../../test/support/deal-doubles.js';
import { RequestValidationError } from '../../common/errors/request-validation.error.js';

const NEIGHBOUR_ID = '0199b1e2-3c4d-7e5f-8a9b-0c1d2e3f4a5c';
const [LOW = '', HIGH = ''] = positionsAfter(null, 2);

describe('DealMovesService', () => {
  let tx: TransactionMock;
  let repository: RepositoryMock;
  let service: DealMovesService;
  let logSpy: MockInstance<Logger['log']>;

  function placement(): { stageId: string; position: string; closedAt: Date | null } | undefined {
    return tx.move.mock.calls[0]?.[3];
  }

  beforeEach(() => {
    tx = createTransactionMock();
    repository = createRepositoryMock(tx);
    service = new DealMovesService(repository);
    logSpy = vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('board', () => {
    it('should filter by the caller when the assignee is me', async () => {
      await service.board(MANAGER, { assignee: 'me' });

      expect(repository.board).toHaveBeenCalledWith(WORKSPACE_ID, { assigneeId: MANAGER.id });
    });

    it('should not filter when no assignee is given', async () => {
      await service.board(MANAGER, {});

      expect(repository.board).toHaveBeenCalledWith(WORKSPACE_ID, { assigneeId: undefined });
    });
  });

  describe('move', () => {
    it('should throw DealNotFoundError when the deal is not visible', async () => {
      tx.findById.mockResolvedValue(null);

      await expect(
        service.move(OWNER, DEAL.id, { version: 1, stageId: CALL_STAGE.id, afterId: null }),
      ).rejects.toBeInstanceOf(DealNotFoundError);
    });

    it('should throw BoardChangedError and write nothing when the stage is not on the board', async () => {
      tx.findStage.mockResolvedValue(null);

      await expect(
        service.move(OWNER, DEAL.id, { version: 1, stageId: CALL_STAGE.id, afterId: null }),
      ).rejects.toBeInstanceOf(BoardChangedError);
      expect(tx.move).not.toHaveBeenCalled();
    });

    it('should throw BoardChangedError when afterId is not a visible deal of the stage', async () => {
      tx.findStage.mockResolvedValue(CALL_STAGE);
      tx.findBoardPosition.mockResolvedValue(null);

      await expect(
        service.move(OWNER, DEAL.id, { version: 1, stageId: CALL_STAGE.id, afterId: NEIGHBOUR_ID }),
      ).rejects.toBeInstanceOf(BoardChangedError);
      expect(tx.move).not.toHaveBeenCalled();
    });

    it('should throw BoardChangedError when afterId is the deal itself', async () => {
      await expect(
        service.move(OWNER, DEAL.id, { version: 1, stageId: NEW_STAGE.id, afterId: DEAL.id }),
      ).rejects.toBeInstanceOf(BoardChangedError);
    });

    it('should throw DealChangedError and write nothing when the version is stale', async () => {
      tx.findById.mockResolvedValue({ ...DEAL, version: 3 });

      await expect(
        service.move(OWNER, DEAL.id, { version: 1, stageId: NEW_STAGE.id, afterId: null }),
      ).rejects.toBeInstanceOf(DealChangedError);
      expect(tx.move).not.toHaveBeenCalled();
    });

    it('should throw DealChangedError when a concurrent move wins the conditional update', async () => {
      tx.move.mockResolvedValue(null);

      await expect(
        service.move(OWNER, DEAL.id, { version: 1, stageId: NEW_STAGE.id, afterId: null }),
      ).rejects.toBeInstanceOf(DealChangedError);
    });

    it('should throw DealNotFoundError when the deal is gone by the conditional update', async () => {
      tx.move.mockResolvedValue(null);
      tx.findById.mockResolvedValueOnce(DEAL).mockResolvedValueOnce(null);

      await expect(
        service.move(OWNER, DEAL.id, { version: 1, stageId: NEW_STAGE.id, afterId: null }),
      ).rejects.toBeInstanceOf(DealNotFoundError);
    });

    it('should place the card between afterId and the next strictly greater key when afterId is given', async () => {
      tx.findStage.mockResolvedValue(CALL_STAGE);
      tx.findBoardPosition.mockResolvedValue(LOW);
      tx.findNextPosition.mockResolvedValue(HIGH);

      await service.move(OWNER, DEAL.id, {
        version: 1,
        stageId: CALL_STAGE.id,
        afterId: NEIGHBOUR_ID,
      });

      expect(tx.findNextPosition).toHaveBeenCalledWith(WORKSPACE_ID, CALL_STAGE.id, LOW, DEAL.id);
      const position = placement()?.position ?? '';
      expect(LOW < position && position < HIGH).toBe(true);
    });

    it.each([WON_STAGE, LOST_STAGE])(
      'should set closedAt when the deal enters $name',
      async (stage) => {
        tx.findStage.mockResolvedValue(stage);

        await service.move(OWNER, DEAL.id, { version: 1, stageId: stage.id, afterId: null });

        expect(placement()?.closedAt).toBeInstanceOf(Date);
      },
    );

    it('should clear closedAt when the deal enters an open stage', async () => {
      tx.findById.mockResolvedValue({
        ...DEAL,
        stage: WON_STAGE,
        closedAt: '2026-10-01T00:00:00.000Z',
      });
      tx.findStage.mockResolvedValue(CALL_STAGE);

      await service.move(OWNER, DEAL.id, { version: 1, stageId: CALL_STAGE.id, afterId: null });

      expect(placement()?.closedAt).toBeNull();
    });

    it('should throw RequestValidationError on assigneeId and write nothing when a closed deal of a former member is reopened', async () => {
      tx.findById.mockResolvedValue({
        ...DEAL,
        stage: WON_STAGE,
        closedAt: '2026-10-01T00:00:00.000Z',
      });
      tx.findStage.mockResolvedValue(CALL_STAGE);
      tx.findMember.mockResolvedValue(null);

      const result = service.move(OWNER, DEAL.id, {
        version: 1,
        stageId: CALL_STAGE.id,
        afterId: null,
      });

      await expect(result).rejects.toBeInstanceOf(RequestValidationError);
      await expect(result).rejects.toMatchObject({
        fieldErrors: [{ path: 'assigneeId', message: 'Choose a member' }],
      });
      expect(tx.move).not.toHaveBeenCalled();
    });

    it('should check no membership when an open deal moves to another open stage', async () => {
      tx.findStage.mockResolvedValue(CALL_STAGE);

      await service.move(OWNER, DEAL.id, { version: 1, stageId: CALL_STAGE.id, afterId: null });

      expect(tx.findMember).not.toHaveBeenCalled();
    });

    it('should ignore afterId when the stage is closed', async () => {
      tx.findStage.mockResolvedValue(WON_STAGE);

      await service.move(OWNER, DEAL.id, {
        version: 1,
        stageId: WON_STAGE.id,
        afterId: NEIGHBOUR_ID,
      });

      expect(tx.findBoardPosition).not.toHaveBeenCalled();
      expect(tx.findNextPosition).toHaveBeenCalledWith(WORKSPACE_ID, WON_STAGE.id, null, DEAL.id);
    });

    it('should write no entry when the card is reordered within its column', async () => {
      await service.move(OWNER, DEAL.id, {
        version: 1,
        stageId: NEW_STAGE.id,
        afterId: NEIGHBOUR_ID,
      });

      expect(tx.move).toHaveBeenCalled();
      expect(tx.addActivity).not.toHaveBeenCalled();
    });

    it('should write a moved entry with both stages and log their ids when the stage changes', async () => {
      tx.findStage.mockResolvedValue(CALL_STAGE);
      tx.move.mockResolvedValue({ ...DEAL, stage: CALL_STAGE, version: 2 });

      await service.move(OWNER, DEAL.id, { version: 1, stageId: CALL_STAGE.id, afterId: null });

      expect(tx.addActivity).toHaveBeenCalledWith(WORKSPACE_ID, DEAL.id, OWNER.id, {
        type: 'deal_moved',
        payload: { from: NEW_STAGE, to: CALL_STAGE },
      });
      expect(logSpy).toHaveBeenCalledWith(
        {
          dealId: DEAL.id,
          workspaceId: WORKSPACE_ID,
          userId: OWNER.id,
          fromStageId: NEW_STAGE.id,
          toStageId: CALL_STAGE.id,
        },
        'Deal moved',
      );
    });
  });
});
