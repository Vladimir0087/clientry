const HOUR_MS = 60 * 60_000;

// A reminder more than a day late is dropped as noise.
export const REMINDER_LATE_LIMIT_MS = 24 * HOUR_MS;
// Longer than the sweep period plus a clock tick, so every reminder is queued before its time.
export const REMINDER_HORIZON_MS = 2 * HOUR_MS;

export interface ReminderState {
  readonly remindAt: string | null;
  readonly reminderSentAt: string | null;
  readonly doneAt: string | null;
}

export interface ReminderWindow {
  readonly from: Date;
  readonly to: Date;
}

export function reminderWindow(now: Date): ReminderWindow {
  return {
    from: new Date(now.getTime() - REMINDER_LATE_LIMIT_MS),
    to: new Date(now.getTime() + REMINDER_HORIZON_MS),
  };
}

export function isTooLate(remindAt: string, now: Date): boolean {
  return Date.parse(remindAt) < reminderWindow(now).from.getTime();
}

// For a visible task: deleted and hidden tasks never reach this check.
export function isPending(task: ReminderState, now: Date): boolean {
  if (task.remindAt === null || task.reminderSentAt !== null || task.doneAt !== null) {
    return false;
  }
  const time = Date.parse(task.remindAt);
  const { from, to } = reminderWindow(now);
  return time >= from.getTime() && time <= to.getTime();
}
