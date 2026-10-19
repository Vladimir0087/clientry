import { vi } from 'vitest';
import type { Mock } from 'vitest';

import type { Deal, Stage } from '@clientry/shared/deals';

import type { AuthUser } from '../../src/common/auth/auth-user.js';
import { positionsAfter } from '../../src/modules/deals/deal-position.js';
import type {
  DealsRepository,
  DealsTransaction,
} from '../../src/modules/deals/deals.repository.js';

export const WORKSPACE_ID = '0199a3c4-5e70-7b1c-8d2e-3f4a5b6c7d8e';

export const OWNER: AuthUser = {
  id: '0199a3c4-5e6f-7a8b-9c0d-1e2f3a4b5c6d',
  workspaceId: WORKSPACE_ID,
  role: 'owner',
  isDemo: false,
};

export const MANAGER: AuthUser = {
  id: '0199a3c4-6a7b-7c8d-9e0f-1a2b3c4d5e6f',
  workspaceId: WORKSPACE_ID,
  role: 'manager',
  isDemo: false,
};

function stage(suffix: string, name: string, kind: Stage['kind']): Stage {
  return { id: `0199a3c4-6f70-7a81-9b2c-3d4e5f6a7b${suffix}`, name, kind };
}

export const NEW_STAGE = stage('81', 'New', 'open');
export const CALL_STAGE = stage('82', 'Call', 'open');
export const PROPOSAL_STAGE = stage('83', 'Proposal sent', 'open');
export const WON_STAGE = stage('85', 'Paid', 'won');
export const LOST_STAGE = stage('86', 'Lost', 'lost');

const [FIRST_POSITION = ''] = positionsAfter(null, 1);

export const CLIENT_REF = { id: '0199a3c4-7d10-7c2e-9a4b-5c6d7e8f9a0b', name: 'Romashka LLC' };

export const DEAL: Deal = {
  id: '0199b1e2-3c4d-7e5f-8a9b-0c1d2e3f4a5b',
  title: 'Landing page for Romashka',
  amount: 150_000,
  currency: 'USD',
  stage: NEW_STAGE,
  client: CLIENT_REF,
  assignee: { id: OWNER.id, name: 'Ann' },
  createdBy: { id: OWNER.id, name: 'Ann' },
  closedAt: null,
  version: 1,
  createdAt: '2026-10-09T09:30:00.000Z',
  updatedAt: '2026-10-09T09:30:00.000Z',
};

export type TransactionMock = { readonly [K in keyof DealsTransaction]: Mock<DealsTransaction[K]> };

type ReadMethod = Exclude<keyof DealsRepository, 'inTransaction'>;

export type RepositoryMock = { readonly [K in ReadMethod]: Mock<DealsRepository[K]> } & {
  readonly inTransaction: DealsRepository['inTransaction'];
};

// Every lookup succeeds by default; a test overrides the one it is about.
export function createTransactionMock(): TransactionMock {
  return {
    findById: vi.fn<DealsTransaction['findById']>().mockResolvedValue(DEAL),
    findClient: vi.fn<DealsTransaction['findClient']>().mockResolvedValue(CLIENT_REF),
    findStage: vi.fn<DealsTransaction['findStage']>().mockResolvedValue(NEW_STAGE),
    findMember: vi
      .fn<DealsTransaction['findMember']>()
      .mockResolvedValue({ id: OWNER.id, name: 'Ann' }),
    findBoardPosition: vi
      .fn<DealsTransaction['findBoardPosition']>()
      .mockResolvedValue(FIRST_POSITION),
    findNextPosition: vi.fn<DealsTransaction['findNextPosition']>().mockResolvedValue(null),
    create: vi.fn<DealsTransaction['create']>().mockResolvedValue(DEAL),
    update: vi.fn<DealsTransaction['update']>().mockResolvedValue({ ...DEAL, version: 2 }),
    move: vi.fn<DealsTransaction['move']>().mockResolvedValue({ ...DEAL, version: 2 }),
    findOwnership: vi.fn<DealsTransaction['findOwnership']>().mockResolvedValue({
      createdById: OWNER.id,
      isDeleted: false,
      isClientDeleted: false,
    }),
    softDelete: vi.fn<DealsTransaction['softDelete']>().mockResolvedValue(true),
    restore: vi.fn<DealsTransaction['restore']>().mockResolvedValue(true),
    addActivity: vi.fn<DealsTransaction['addActivity']>().mockResolvedValue(undefined),
  };
}

export function createRepositoryMock(tx: DealsTransaction): RepositoryMock {
  return {
    findById: vi.fn<DealsRepository['findById']>().mockResolvedValue(DEAL),
    isVisible: vi.fn<DealsRepository['isVisible']>().mockResolvedValue(true),
    board: vi.fn<DealsRepository['board']>().mockResolvedValue([]),
    listByClient: vi
      .fn<DealsRepository['listByClient']>()
      .mockResolvedValue({ items: [], hasMore: false }),
    history: vi.fn<DealsRepository['history']>().mockResolvedValue({ items: [], hasMore: false }),
    inTransaction: (work) => work(tx),
  };
}
