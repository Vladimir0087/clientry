import {
  boardResponseSchema,
  CURRENCIES,
  dealSchema,
  stageListResponseSchema,
} from '@clientry/shared/deals';
import type {
  Board,
  Deal,
  DealCard,
  Stage,
  StageListItem,
  StageListResponse,
} from '@clientry/shared/deals';
import { memberListResponseSchema } from '@clientry/shared/workspaces';
import type { MemberListResponse } from '@clientry/shared/workspaces';

import { TEST_CLIENT } from './clients';
import { TEST_SESSION } from './fixtures';

function stageId(index: number): string {
  return `0199a3c4-6f70-7a81-9b2c-${String(index).padStart(12, '0')}`;
}

function dealId(index: number): string {
  return `0199b1e2-3c4d-7e5f-8a9b-${String(index).padStart(12, '0')}`;
}

// The six stages registration creates, in board order.
export const TEST_STAGES: StageListResponse = stageListResponseSchema.parse({
  items: [
    { id: stageId(1), name: 'New', kind: 'open', dealCount: 0 },
    { id: stageId(2), name: 'Call', kind: 'open', dealCount: 0 },
    { id: stageId(3), name: 'Proposal sent', kind: 'open', dealCount: 0 },
    { id: stageId(4), name: 'Contract', kind: 'open', dealCount: 0 },
    { id: stageId(5), name: 'Paid', kind: 'won', dealCount: 0 },
    { id: stageId(6), name: 'Lost', kind: 'lost', dealCount: 0 },
  ],
});

export function stageItemAt(index: number): StageListItem {
  const stage = TEST_STAGES.items[index];
  if (stage === undefined) {
    throw new Error(`No test stage at ${String(index)}`);
  }
  return stage;
}

function stageAt(index: number): Stage {
  const { id, name, kind } = stageItemAt(index);
  return { id, name, kind };
}

export const NEW_STAGE = stageAt(0);
export const CALL_STAGE = stageAt(1);
export const PROPOSAL_STAGE = stageAt(2);
export const WON_STAGE = stageAt(4);

export const TEST_MEMBERS: MemberListResponse = memberListResponseSchema.parse({
  items: [
    {
      id: TEST_SESSION.user.id,
      name: TEST_SESSION.user.name,
      email: TEST_SESSION.user.email,
      role: TEST_SESSION.role,
      joinedAt: '2026-10-01T09:00:00.000Z',
    },
  ],
});

const ANN = { id: TEST_SESSION.user.id, name: TEST_SESSION.user.name };

export const TEST_DEAL: Deal = dealSchema.parse({
  id: dealId(1),
  title: 'Landing page for Romashka',
  amount: 150000,
  currency: 'USD',
  stage: NEW_STAGE,
  client: { id: TEST_CLIENT.id, name: TEST_CLIENT.name },
  assignee: ANN,
  createdBy: ANN,
  closedAt: null,
  version: 3,
  createdAt: '2026-10-09T09:30:00.000Z',
  updatedAt: '2026-10-09T11:05:00.000Z',
});

export function makeDeal(index: number, overrides: Partial<Deal> = {}): Deal {
  return { ...TEST_DEAL, id: dealId(index), title: `Deal ${String(index)}`, ...overrides };
}

function toCard(deal: Deal): DealCard {
  const { id, title, amount, currency, client, assignee, closedAt, version } = deal;
  return { id, title, amount, currency, client, assignee, closedAt, version };
}

// Every stage as a column; counts and totals are worked out from the deals given, totals in the
// server's currency order.
export function makeBoard(deals: readonly Deal[]): Board {
  return boardResponseSchema.parse({
    columns: TEST_STAGES.items.map((item) => {
      const inStage = deals.filter((deal) => deal.stage.id === item.id);
      const currencies = CURRENCIES.filter((currency) =>
        inStage.some((deal) => deal.currency === currency),
      );
      return {
        stage: { id: item.id, name: item.name, kind: item.kind },
        deals: inStage.map(toCard),
        count: inStage.length,
        totals: currencies.map((currency) => {
          const matching = inStage.filter((deal) => deal.currency === currency);
          return {
            currency,
            amount: matching.reduce((sum, deal) => sum + deal.amount, 0),
            count: matching.length,
          };
        }),
      };
    }),
  });
}
