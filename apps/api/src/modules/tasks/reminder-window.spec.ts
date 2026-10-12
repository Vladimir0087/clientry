import { describe, expect, it } from 'vitest';

import { isPending, isTooLate, reminderWindow } from './reminder-window.js';
import type { ReminderState } from './reminder-window.js';

const NOW = new Date('2026-10-14T10:00:00.000Z');

const PENDING: ReminderState = {
  remindAt: '2026-10-14T11:00:00.000Z',
  reminderSentAt: null,
  doneAt: null,
};

describe('reminder window', () => {
  it('should span from a day ago to two hours ahead when built', () => {
    expect(reminderWindow(NOW)).toEqual({
      from: new Date('2026-10-13T10:00:00.000Z'),
      to: new Date('2026-10-14T12:00:00.000Z'),
    });
  });

  it.each([
    ['inside the window', PENDING.remindAt],
    ['at the late limit', '2026-10-13T10:00:00.000Z'],
    ['at the horizon', '2026-10-14T12:00:00.000Z'],
    ['an hour late', '2026-10-14T09:00:00.000Z'],
  ])('should be pending when the reminder is %s', (_case, remindAt) => {
    expect(isPending({ ...PENDING, remindAt }, NOW)).toBe(true);
  });

  it.each<[string, Partial<ReminderState>]>([
    ['not set', { remindAt: null }],
    ['sent', { reminderSentAt: '2026-10-14T09:59:00.000Z' }],
    ['on a done task', { doneAt: '2026-10-14T09:00:00.000Z' }],
    ['more than a day late', { remindAt: '2026-10-13T09:59:59.999Z' }],
    ['beyond the horizon', { remindAt: '2026-10-14T12:00:00.001Z' }],
  ])('should not be pending when the reminder is %s', (_case, change) => {
    expect(isPending({ ...PENDING, ...change }, NOW)).toBe(false);
  });

  it.each([
    ['2026-10-13T09:59:59.999Z', true],
    ['2026-10-13T10:00:00.000Z', false],
  ])('should tell whether %s is too late when checked', (remindAt, isLate) => {
    expect(isTooLate(remindAt, NOW)).toBe(isLate);
  });
});
