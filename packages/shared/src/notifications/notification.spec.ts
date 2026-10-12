import { describe, expect, it } from 'vitest';

import { markAllReadRequestSchema, notificationSchema } from './notification.js';

const ENTRY = {
  id: '0199c3b0-1a2b-7c3d-8e4f-5a6b7c8d9e0f',
  type: 'task_reminder',
  payload: {
    task: { id: '0199c2a1-1a2b-7c3d-8e4f-5a6b7c8d9e0f', title: 'Call Romashka' },
    dueAt: '2026-10-15T12:00:00.000Z',
  },
  readAt: null,
  createdAt: '2026-10-15T06:00:01.204Z',
};

describe('notificationSchema', () => {
  it('should parse the entry when its type is task_reminder', () => {
    expect(notificationSchema.parse(ENTRY)).toEqual(ENTRY);
  });

  it('should reject the entry when its type is unknown', () => {
    expect(notificationSchema.safeParse({ ...ENTRY, type: 'deal_moved' }).success).toBe(false);
  });

  it('should reject a task_reminder entry when its payload has no task', () => {
    const entry = { ...ENTRY, payload: { dueAt: ENTRY.payload.dueAt } };

    expect(notificationSchema.safeParse(entry).success).toBe(false);
  });
});

describe('markAllReadRequestSchema', () => {
  it('should reject the body when before is missing', () => {
    expect(markAllReadRequestSchema.safeParse({}).success).toBe(false);
  });
});
