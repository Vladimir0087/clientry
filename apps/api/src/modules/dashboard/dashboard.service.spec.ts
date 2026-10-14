import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';

import type { DashboardRepository, SummaryRows } from './dashboard.repository.js';
import { DashboardService } from './dashboard.service.js';
import {
  CALL_STAGE,
  MANAGER,
  NEW_STAGE,
  OWNER,
  WORKSPACE_ID,
} from '../../../test/support/deal-doubles.js';

const ANN = { id: OWNER.id, name: 'Ann' };
const MAX = { id: MANAGER.id, name: 'Max' };

const EMPTY: SummaryRows = { stages: [], deals: [], tasks: [], members: [] };

const BOUNDS = ['2026-08-31T21:00:00.000Z', '2026-09-30T21:00:00.000Z', '2026-10-31T21:00:00.000Z'];

interface RepositoryMock {
  readonly summary: Mock<DashboardRepository['summary']>;
  readonly closedDeals: Mock<DashboardRepository['closedDeals']>;
}

describe('DashboardService', () => {
  let repository: RepositoryMock;
  let service: DashboardService;

  beforeEach(() => {
    repository = {
      summary: vi.fn<DashboardRepository['summary']>().mockResolvedValue(EMPTY),
      closedDeals: vi.fn<DashboardRepository['closedDeals']>().mockResolvedValue([]),
    };
    service = new DashboardService(repository);
  });

  describe('summary', () => {
    it('should pass the workspace of the caller when the summary is read', async () => {
      await service.summary(MANAGER);

      expect(repository.summary).toHaveBeenCalledWith(WORKSPACE_ID);
    });

    it('should sum openDeals per currency from the stage rows when stages hold deals', async () => {
      repository.summary.mockResolvedValue({
        ...EMPTY,
        stages: [
          {
            stage: NEW_STAGE,
            totals: [
              { currency: 'EUR', count: 1, amount: 50_00 },
              { currency: 'USD', count: 2, amount: 300_00 },
            ],
          },
          { stage: CALL_STAGE, totals: [{ currency: 'USD', count: 1, amount: 100_00 }] },
        ],
      });

      const summary = await service.summary(OWNER);

      expect(summary.openDeals).toEqual({
        count: 4,
        totals: [
          { currency: 'USD', count: 3, amount: 400_00 },
          { currency: 'EUR', count: 1, amount: 50_00 },
        ],
      });
      expect(summary.stages.map(({ count }) => count)).toEqual([3, 1]);
    });

    it('should keep an empty stage with zero deals when it has no rows', async () => {
      repository.summary.mockResolvedValue({
        ...EMPTY,
        stages: [{ stage: NEW_STAGE, totals: [] }],
      });

      const summary = await service.summary(OWNER);

      expect(summary.stages).toEqual([{ stage: NEW_STAGE, count: 0, totals: [] }]);
    });

    it('should give a member without work zero rows when only another member has work', async () => {
      repository.summary.mockResolvedValue({
        ...EMPTY,
        deals: [{ assigneeId: ANN.id, currency: 'USD', count: 2, amount: 200_00 }],
        tasks: [{ assigneeId: ANN.id, open: 3, overdue: 1 }],
        members: [ANN, MAX],
      });

      const summary = await service.summary(OWNER);

      expect(summary.members).toEqual([
        {
          member: ANN,
          openDeals: { count: 2, totals: [{ currency: 'USD', count: 2, amount: 200_00 }] },
          openTasks: 3,
          overdueTasks: 1,
        },
        { member: MAX, openDeals: { count: 0, totals: [] }, openTasks: 0, overdueTasks: 0 },
      ]);
    });

    it('should sum open and overdue tasks over the assignee rows when several hold tasks', async () => {
      repository.summary.mockResolvedValue({
        ...EMPTY,
        tasks: [
          { assigneeId: ANN.id, open: 3, overdue: 1 },
          { assigneeId: MAX.id, open: 2, overdue: 2 },
        ],
      });

      const summary = await service.summary(OWNER);

      expect(summary.tasks).toEqual({ open: 5, overdue: 3 });
    });
  });

  describe('closedDeals', () => {
    it('should pass the workspace of the caller and the bounds when closed deals are read', async () => {
      await service.closedDeals(MANAGER, { bounds: BOUNDS });

      expect(repository.closedDeals).toHaveBeenCalledWith(WORKSPACE_ID, BOUNDS);
    });

    it('should give one period per pair of neighbouring bounds when rows fall in some', async () => {
      repository.closedDeals.mockResolvedValue([
        { period: 1, kind: 'won', currency: 'USD', count: 2, amount: 500_00 },
        { period: 1, kind: 'lost', currency: 'EUR', count: 1, amount: 70_00 },
      ]);

      const { periods } = await service.closedDeals(OWNER, { bounds: BOUNDS });

      expect(periods).toEqual([
        {
          start: BOUNDS[0],
          end: BOUNDS[1],
          won: { count: 0, totals: [] },
          lost: { count: 0, totals: [] },
        },
        {
          start: BOUNDS[1],
          end: BOUNDS[2],
          won: { count: 2, totals: [{ currency: 'USD', count: 2, amount: 500_00 }] },
          lost: { count: 1, totals: [{ currency: 'EUR', count: 1, amount: 70_00 }] },
        },
      ]);
    });
  });
});
