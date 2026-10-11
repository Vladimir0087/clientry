import { describe, expect, it } from 'vitest';

import { dealActivitySchema } from './deal-activity.js';
import type { DealEvent } from './deal-activity.js';
import type { Stage } from './stage.js';

const ENTRY = {
  id: '0199b1f0-3c4d-7e5f-8a9b-0c1d2e3f4a5b',
  actor: { id: '0199a3c4-5e6f-7a8b-9c0d-1e2f3a4b5c6d', name: 'Ann' },
  createdAt: '2026-10-09T11:05:00.000Z',
};
const CALL: Stage = { id: '0199a3c4-6f70-7a81-9b2c-3d4e5f6a7b8c', name: 'Call', kind: 'open' };
const PAID: Stage = { id: '0199a3c4-6f70-7a81-9b2c-3d4e5f6a7b8d', name: 'Paid', kind: 'won' };
const ROMASHKA = { id: '0199a3c4-7d10-7c2e-9a4b-5c6d7e8f9a0b', name: 'Romashka LLC' };
const ANN = { id: '0199a3c4-5e6f-7a8b-9c0d-1e2f3a4b5c6d', name: 'Ann' };
const MAX = { id: '0199a3c4-6a7b-7c8d-9e0f-1a2b3c4d5e6f', name: 'Max' };

describe('dealActivitySchema', () => {
  it.each<[string, DealEvent]>([
    [
      'deal_created',
      { type: 'deal_created', payload: { stage: CALL, amount: 0, currency: 'EUR' } },
    ],
    ['deal_moved', { type: 'deal_moved', payload: { from: CALL, to: PAID } }],
    [
      'deal_moved by a stage deletion',
      { type: 'deal_moved', payload: { from: CALL, to: PAID, reason: 'stage_deleted' } },
    ],
    [
      'deal_updated',
      {
        type: 'deal_updated',
        payload: {
          changes: [
            { field: 'title', from: 'Old', to: 'New' },
            {
              field: 'amount',
              from: { amount: 100, currency: 'USD' },
              to: { amount: 100, currency: 'EUR' },
            },
            { field: 'client', from: ROMASHKA, to: { ...ROMASHKA, name: 'Other' } },
            { field: 'assignee', from: ANN, to: MAX },
          ],
        },
      },
    ],
    ['deal_deleted', { type: 'deal_deleted', payload: {} }],
    ['deal_restored', { type: 'deal_restored', payload: {} }],
  ])('should parse the entry when its type is %s', (_case, event) => {
    expect(dealActivitySchema.parse({ ...ENTRY, ...event })).toEqual({ ...ENTRY, ...event });
  });

  it('should reject the entry when its type is unknown', () => {
    expect(
      dealActivitySchema.safeParse({ ...ENTRY, type: 'deal_archived', payload: {} }).success,
    ).toBe(false);
  });

  it('should reject a deal_moved entry when to is missing', () => {
    expect(
      dealActivitySchema.safeParse({ ...ENTRY, type: 'deal_moved', payload: { from: CALL } })
        .success,
    ).toBe(false);
  });
});
