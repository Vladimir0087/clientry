import { describe, expect, it } from 'vitest';

import { activityEntrySchema, activityEventSchema, activityFeedQuerySchema } from './activity.js';
import type { ActivityEvent } from './activity.js';

const ANN = { id: '0199a3c4-5e6f-7a8b-9c0d-1e2f3a4b5c6d', name: 'Ann' };
const MAX = { id: '0199a3c4-6a7b-7c8d-9e0f-1a2b3c4d5e6f', name: 'Max' };
const CALL = { id: '0199a3c4-6f70-7a81-9b2c-3d4e5f6a7b8c', name: 'Call', kind: 'open' } as const;
const PAID = { id: '0199a3c4-6f70-7a81-9b2c-3d4e5f6a7b8d', name: 'Paid', kind: 'won' } as const;
const SUBJECT_ID = '0199b1e2-3c4d-7e5f-8a9b-0c1d2e3f4a5b';

const ENTRY = {
  id: '0199b1f0-2a3b-7c4d-8e5f-6a7b8c9d0e1f',
  actor: ANN,
  createdAt: '2026-10-13T09:05:00.000Z',
};

function subject(kind: 'deal' | 'client' | 'task'): Record<string, unknown> {
  return { kind, id: SUBJECT_ID, label: 'Landing page', isAvailable: true };
}

describe('activityEventSchema', () => {
  it.each<[string, ActivityEvent]>([
    ['client_created', { type: 'client_created', payload: {} }],
    [
      'task_created',
      { type: 'task_created', payload: { assignee: MAX, dueAt: '2026-10-15T12:00:00.000Z' } },
    ],
    ['task_completed', { type: 'task_completed', payload: {} }],
  ])('should parse the event when its type is %s', (_case, event) => {
    expect(activityEventSchema.parse(event)).toEqual(event);
  });

  it.each<[string, ActivityEvent]>([
    [
      'deal_created',
      { type: 'deal_created', payload: { stage: CALL, amount: 1500_00, currency: 'USD' } },
    ],
    ['deal_moved', { type: 'deal_moved', payload: { from: CALL, to: PAID } }],
    [
      'deal_updated',
      { type: 'deal_updated', payload: { changes: [{ field: 'title', from: 'A', to: 'B' }] } },
    ],
    ['deal_deleted', { type: 'deal_deleted', payload: {} }],
    ['deal_restored', { type: 'deal_restored', payload: {} }],
  ])('should still parse the deal event when its type is %s', (_case, event) => {
    expect(activityEventSchema.parse(event)).toEqual(event);
  });

  it('should reject a task_created event when its payload has no dueAt', () => {
    const event = { type: 'task_created', payload: { assignee: MAX } };

    expect(activityEventSchema.safeParse(event).success).toBe(false);
  });

  it('should reject the event when its type is unknown', () => {
    expect(activityEventSchema.safeParse({ type: 'client_updated', payload: {} }).success).toBe(
      false,
    );
  });
});

describe('activityEntrySchema', () => {
  it.each([
    ['deal_deleted', 'deal'],
    ['client_created', 'client'],
    ['task_completed', 'task'],
  ] as const)('should parse a %s entry when its subject is a %s', (type, kind) => {
    const entry = { ...ENTRY, type, payload: {}, subject: subject(kind) };

    expect(activityEntrySchema.parse(entry)).toEqual(entry);
  });

  it.each([
    ['deal_deleted', 'client'],
    ['client_created', 'task'],
    ['task_completed', 'deal'],
  ] as const)('should reject a %s entry when its subject is a %s', (type, kind) => {
    const entry = { ...ENTRY, type, payload: {}, subject: subject(kind) };

    expect(activityEntrySchema.safeParse(entry).success).toBe(false);
  });
});

describe('activityFeedQuerySchema', () => {
  it('should default the limit to 20 when none is given', () => {
    expect(activityFeedQuerySchema.parse({})).toEqual({ limit: 20 });
  });

  it('should reject the query when limit is 51', () => {
    expect(activityFeedQuerySchema.safeParse({ limit: '51' }).success).toBe(false);
  });
});
