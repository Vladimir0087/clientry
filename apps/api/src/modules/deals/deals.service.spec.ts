import { Logger } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MockInstance } from 'vitest';

import type { CreateDealRequest } from '@clientry/shared/deals';

import { positionsAfter } from './deal-position.js';
import { DealsService } from './deals.service.js';
import { DealChangedError, DealDeleteForbiddenError, DealNotFoundError } from './errors.js';
import {
  CLIENT_REF,
  createRepositoryMock,
  createTransactionMock,
  DEAL,
  MANAGER,
  NEW_STAGE,
  OWNER,
  WON_STAGE,
  WORKSPACE_ID,
} from '../../../test/support/deal-doubles.js';
import type { RepositoryMock, TransactionMock } from '../../../test/support/deal-doubles.js';
import type { AuthUser } from '../../common/auth/auth-user.js';
import { RequestValidationError } from '../../common/errors/request-validation.error.js';

const INPUT: CreateDealRequest = {
  title: DEAL.title,
  clientId: CLIENT_REF.id,
  stageId: NEW_STAGE.id,
  amount: DEAL.amount,
  currency: 'USD',
  assigneeId: OWNER.id,
};

describe('DealsService', () => {
  let tx: TransactionMock;
  let repository: RepositoryMock;
  let service: DealsService;
  let logSpy: MockInstance<Logger['log']>;

  function ownedBy(user: AuthUser, isDeleted = false): void {
    tx.findOwnership.mockResolvedValue({ createdById: user.id, isDeleted, isClientDeleted: false });
  }

  beforeEach(() => {
    tx = createTransactionMock();
    repository = createRepositoryMock(tx);
    service = new DealsService(repository);
    logSpy = vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('create', () => {
    it('should pass the workspace and the caller and put the deal at the top when a deal is created', async () => {
      const [first = ''] = positionsAfter(null, 1);
      tx.findNextPosition.mockResolvedValue(first);

      await service.create(MANAGER, INPUT);

      expect(tx.findNextPosition).toHaveBeenCalledWith(WORKSPACE_ID, NEW_STAGE.id, null, null);
      const [workspaceId, createdById, deal] = tx.create.mock.calls[0] ?? [];
      expect([workspaceId, createdById]).toEqual([WORKSPACE_ID, MANAGER.id]);
      expect(deal).toMatchObject({ ...INPUT, closedAt: null });
      expect((deal?.position ?? '') < first).toBe(true);
    });

    it('should write a created entry with the stage, amount and currency when a deal is created', async () => {
      await service.create(OWNER, INPUT);

      expect(tx.addActivity).toHaveBeenCalledWith(WORKSPACE_ID, DEAL.id, OWNER.id, {
        type: 'deal_created',
        payload: { stage: NEW_STAGE, amount: INPUT.amount, currency: 'USD' },
      });
    });

    it('should set closedAt when the stage is won', async () => {
      tx.findStage.mockResolvedValue(WON_STAGE);

      await service.create(OWNER, { ...INPUT, stageId: WON_STAGE.id });

      expect(tx.create.mock.calls[0]?.[2].closedAt).toBeInstanceOf(Date);
    });

    it.each([
      ['clientId', 'Choose a client', (mock: TransactionMock) => mock.findClient],
      ['stageId', 'Choose a stage', (mock: TransactionMock) => mock.findStage],
      ['assigneeId', 'Choose a member', (mock: TransactionMock) => mock.findMember],
    ] as const)(
      'should throw RequestValidationError on %s and write nothing when it is not found',
      async (path, message, lookup) => {
        lookup(tx).mockResolvedValue(null);

        const result = service.create(OWNER, INPUT);

        await expect(result).rejects.toBeInstanceOf(RequestValidationError);
        await expect(result).rejects.toMatchObject({ fieldErrors: [{ path, message }] });
        expect(tx.create).not.toHaveBeenCalled();
      },
    );

    it('should log ids and no deal or client names when a deal is created', async () => {
      await service.create(OWNER, INPUT);

      expect(logSpy).toHaveBeenCalledWith(
        { dealId: DEAL.id, workspaceId: WORKSPACE_ID, userId: OWNER.id },
        'Deal created',
      );
      const logged = JSON.stringify(logSpy.mock.calls);
      expect(logged).not.toContain(DEAL.title);
      expect(logged).not.toContain(CLIENT_REF.name);
      expect(logged).not.toContain(String(DEAL.amount));
    });
  });

  describe('missing deal', () => {
    beforeEach(() => {
      repository.findById.mockResolvedValue(null);
      repository.isVisible.mockResolvedValue(false);
      tx.findById.mockResolvedValue(null);
      tx.findOwnership.mockResolvedValue(null);
    });

    it.each([
      ['get', (s: DealsService) => s.get(OWNER, DEAL.id)],
      ['history', (s: DealsService) => s.history(OWNER, DEAL.id)],
      ['update', (s: DealsService) => s.update(OWNER, DEAL.id, { version: 1, title: 'New' })],
      ['delete', (s: DealsService) => s.delete(OWNER, DEAL.id)],
      ['restore', (s: DealsService) => s.restore(OWNER, DEAL.id)],
    ])('should throw DealNotFoundError when %s finds nothing', async (_case, call) => {
      await expect(call(service)).rejects.toBeInstanceOf(DealNotFoundError);
    });

    it('should throw DealNotFoundError when the client of the deal is deleted', async () => {
      tx.findOwnership.mockResolvedValue({
        createdById: OWNER.id,
        isDeleted: true,
        isClientDeleted: true,
      });

      await expect(service.restore(OWNER, DEAL.id)).rejects.toBeInstanceOf(DealNotFoundError);
      expect(tx.restore).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('should return the deal and write nothing when every sent value is the stored one', async () => {
      const deal = await service.update(OWNER, DEAL.id, {
        version: 9,
        title: DEAL.title,
        amount: DEAL.amount,
      });

      expect(deal).toEqual(DEAL);
      expect(tx.update).not.toHaveBeenCalled();
      expect(tx.addActivity).not.toHaveBeenCalled();
    });

    it('should send only the changed fields at the sent version when some fields change', async () => {
      await service.update(OWNER, DEAL.id, { version: 1, title: 'Shop', amount: DEAL.amount });

      expect(tx.update).toHaveBeenCalledWith(WORKSPACE_ID, DEAL.id, 1, {
        title: 'Shop',
        clientId: undefined,
        amount: undefined,
        currency: undefined,
        assigneeId: undefined,
      });
    });

    it('should throw DealChangedError and write nothing when the version is stale', async () => {
      tx.findById.mockResolvedValue({ ...DEAL, version: 2 });

      const result = service.update(OWNER, DEAL.id, { version: 1, title: 'Shop' });

      await expect(result).rejects.toBeInstanceOf(DealChangedError);
      expect(tx.update).not.toHaveBeenCalled();
    });

    it('should throw DealChangedError when a concurrent write wins the conditional update', async () => {
      tx.update.mockResolvedValue(null);

      await expect(
        service.update(OWNER, DEAL.id, { version: 1, title: 'Shop' }),
      ).rejects.toBeInstanceOf(DealChangedError);
    });

    it('should throw DealNotFoundError when the deal is gone by the conditional update', async () => {
      tx.update.mockResolvedValue(null);
      tx.findById.mockResolvedValueOnce(DEAL).mockResolvedValueOnce(null);

      await expect(
        service.update(OWNER, DEAL.id, { version: 1, title: 'Shop' }),
      ).rejects.toBeInstanceOf(DealNotFoundError);
    });

    it('should throw RequestValidationError on assigneeId when the new assignee is not a member', async () => {
      tx.findMember.mockResolvedValue(null);

      const result = service.update(OWNER, DEAL.id, { version: 1, assigneeId: MANAGER.id });

      await expect(result).rejects.toMatchObject({
        fieldErrors: [{ path: 'assigneeId', message: 'Choose a member' }],
      });
      expect(tx.update).not.toHaveBeenCalled();
    });

    it('should write one updated entry built from the stored and the updated deal when the edit is saved', async () => {
      tx.update.mockResolvedValue({ ...DEAL, title: 'Shop', version: 2 });

      await service.update(OWNER, DEAL.id, { version: 1, title: 'Shop' });

      expect(tx.addActivity).toHaveBeenCalledWith(WORKSPACE_ID, DEAL.id, OWNER.id, {
        type: 'deal_updated',
        payload: { changes: [{ field: 'title', from: DEAL.title, to: 'Shop' }] },
      });
    });
  });

  describe('delete', () => {
    it('should throw DealDeleteForbiddenError and write nothing when a manager deletes another user deal', async () => {
      ownedBy(OWNER);

      await expect(service.delete(MANAGER, DEAL.id)).rejects.toBeInstanceOf(
        DealDeleteForbiddenError,
      );
      expect(tx.softDelete).not.toHaveBeenCalled();
    });

    it.each([
      ['a manager deletes their own deal', MANAGER, MANAGER],
      ['the owner deletes a manager deal', OWNER, MANAGER],
    ])('should delete and write an entry when %s', async (_case, user, creator) => {
      ownedBy(creator);

      await service.delete(user, DEAL.id);

      expect(tx.softDelete).toHaveBeenCalledWith(WORKSPACE_ID, DEAL.id);
      expect(tx.addActivity).toHaveBeenCalledWith(WORKSPACE_ID, DEAL.id, user.id, {
        type: 'deal_deleted',
        payload: {},
      });
    });

    it('should throw DealNotFoundError when the deal is already deleted', async () => {
      ownedBy(OWNER, true);

      await expect(service.delete(OWNER, DEAL.id)).rejects.toBeInstanceOf(DealNotFoundError);
      expect(tx.softDelete).not.toHaveBeenCalled();
    });

    it('should log ids when a deal is deleted', async () => {
      await service.delete(OWNER, DEAL.id);

      expect(logSpy).toHaveBeenCalledWith(
        { dealId: DEAL.id, workspaceId: WORKSPACE_ID, userId: OWNER.id },
        'Deal deleted',
      );
    });
  });

  describe('restore', () => {
    it('should throw DealDeleteForbiddenError and write nothing when a manager restores another user deal', async () => {
      ownedBy(OWNER, true);

      await expect(service.restore(MANAGER, DEAL.id)).rejects.toBeInstanceOf(
        DealDeleteForbiddenError,
      );
      expect(tx.restore).not.toHaveBeenCalled();
    });

    it.each([
      ['a manager restores their own deal', MANAGER, MANAGER],
      ['the owner restores a manager deal', OWNER, MANAGER],
    ])('should restore and write an entry when %s', async (_case, user, creator) => {
      ownedBy(creator, true);

      await expect(service.restore(user, DEAL.id)).resolves.toEqual(DEAL);
      expect(tx.restore).toHaveBeenCalledWith(WORKSPACE_ID, DEAL.id);
      expect(tx.addActivity).toHaveBeenCalledWith(WORKSPACE_ID, DEAL.id, user.id, {
        type: 'deal_restored',
        payload: {},
      });
    });

    it('should log ids when a deleted deal is restored', async () => {
      ownedBy(OWNER, true);

      await service.restore(OWNER, DEAL.id);

      expect(logSpy).toHaveBeenCalledWith(
        { dealId: DEAL.id, workspaceId: WORKSPACE_ID, userId: OWNER.id },
        'Deal restored',
      );
    });

    it('should return the deal without writing an entry when it is active', async () => {
      ownedBy(OWNER);

      await expect(service.restore(OWNER, DEAL.id)).resolves.toEqual(DEAL);
      expect(tx.restore).not.toHaveBeenCalled();
      expect(tx.addActivity).not.toHaveBeenCalled();
      expect(logSpy).not.toHaveBeenCalled();
    });
  });

  describe('reads', () => {
    it('should ask for 50 deals of the client when the client deals are listed', async () => {
      await service.listByClient(OWNER, { clientId: CLIENT_REF.id });

      expect(repository.listByClient).toHaveBeenCalledWith(WORKSPACE_ID, CLIENT_REF.id, 50);
    });

    it('should ask for 100 entries when the history is read', async () => {
      await service.history(OWNER, DEAL.id);

      expect(repository.history).toHaveBeenCalledWith(WORKSPACE_ID, DEAL.id, 100);
    });
  });
});
