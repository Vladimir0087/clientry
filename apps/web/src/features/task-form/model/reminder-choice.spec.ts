import { describe, expect, it } from 'vitest';

import { choiceFor, defaultReminder, reminderInstant, reminderOptions } from './reminder-choice';

const DUE_AT = '2026-10-15T12:00:00.000Z';

describe('reminder-choice', () => {
  it.each([
    ['at_due', '2026-10-15T12:00:00.000Z'],
    ['minutes_15', '2026-10-15T11:45:00.000Z'],
    ['hour_1', '2026-10-15T11:00:00.000Z'],
    ['day_1', '2026-10-14T12:00:00.000Z'],
  ] as const)('should remind at the right instant when the choice is %s', (choice, instant) => {
    expect(reminderInstant(choice, DUE_AT, null)).toBe(instant);
  });

  it('should use the custom instant when the choice is custom', () => {
    expect(reminderInstant('custom', DUE_AT, '2026-10-15T06:00:00.000Z')).toBe(
      '2026-10-15T06:00:00.000Z',
    );
  });

  it('should give no reminder when the choice is none', () => {
    expect(reminderInstant('none', DUE_AT, '2026-10-15T06:00:00.000Z')).toBeNull();
  });

  it('should disable the passed shortcuts with "(passed)" when the due time is near', () => {
    const now = new Date('2026-10-15T11:50:00.000Z');

    const options = reminderOptions(DUE_AT, now);

    expect(
      options.filter((option) => option.isDisabled === true).map(({ label }) => label),
    ).toEqual(['15 minutes before (passed)', '1 hour before (passed)', '1 day before (passed)']);
  });

  it('should offer every shortcut when the due time is not known yet', () => {
    const options = reminderOptions(null, new Date('2026-10-15T11:50:00.000Z'));

    expect(options.some((option) => option.isDisabled === true)).toBe(false);
  });

  it.each([
    [null, '2026-10-15T11:59:00.000Z'],
    [DUE_AT, '2026-10-15T11:59:00.000Z'],
  ])('should default to the due time when the due time is %s at %s', (dueAt, now) => {
    expect(defaultReminder(dueAt, new Date(now))).toBe('at_due');
  });

  it('should default to no reminder when the due time has come', () => {
    expect(defaultReminder(DUE_AT, new Date(DUE_AT))).toBe('none');
  });

  it.each([
    [null, 'none'],
    ['2026-10-15T12:00:00.000Z', 'at_due'],
    ['2026-10-15T11:45:00.000Z', 'minutes_15'],
    ['2026-10-15T11:00:00.000Z', 'hour_1'],
    ['2026-10-14T12:00:00.000Z', 'day_1'],
    ['2026-10-15T06:00:00.000Z', 'custom'],
  ])('should derive the choice when the reminder is %s', (remindAt, choice) => {
    expect(choiceFor(DUE_AT, remindAt)).toBe(choice);
  });
});
